'use client';

// WebBoardPresenceProvider — wires the renderer-agnostic
// `@boardsesh/board-presence-react` into the web app. Mirrors the mobile
// `MobileBoardPresenceProvider`.
//
// It owns three things:
//   1. The connected `boardId` (resolved from the BLE serial on connect). This
//      is the channel key the wall feed is keyed on.
//   2. A dedicated graphql-ws client for the board-presence feed. The
//      persistent-session WS client only exists during a party session, but the
//      wall feed must work solo too — so we build our own standalone client
//      (the same `createGraphQLClient({ url, authToken })` pattern used by the
//      comment-section live subscription), recreated when the auth token loads.
//   3. A web `BoardPresenceClient` handed to the shared `BoardPresenceProvider`,
//      which runs `useBoardPresence(boardId)` (subscribe + backfill + reducer)
//      and exposes the wall's now-playing state via split presence contexts.
//
// Board presence is always-on. The provider stays inert until a board is bound:
// `boardId` is null (so the shared hook collapses to its empty state) and the WS
// client only resolves once `resolveAndBindBoard` runs on first sighting.
//
// The bluetooth provider (mounted inside this one) calls
// `useBoardPresenceControls()` to (a) resolve+store the boardId on connect and
// (b) report a freshly-lit climb on wall-confirm. Reads of the wall's current
// climb go through `@boardsesh/board-presence-react`'s split contexts.

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  BoardPresenceActionsContext,
  BoardPresenceCurrentContext,
  BoardPresenceProvider,
  type UseBoardPresenceResult,
} from '@boardsesh/board-presence-react';
import type { ClimbQueueItemInput, ResolvedBoard } from '@boardsesh/shared-schema';
import { SHARED_EVENTS } from '@boardsesh/analytics';
import { createGraphQLClient, type Client } from '../graphql-queue/graphql-client';
import { getBackendWsUrl } from '@/app/lib/backend-url';
import { useWsAuthToken } from '@/app/hooks/use-ws-auth-token';
import { track } from '@/app/lib/analytics';
import { createWebBoardPresenceClient, type WebBoardPresenceClient } from './board-presence-client';

/** Board config needed to find-or-bind the shared board on first sighting. */
export type ResolveBoardArgs = {
  serial?: string | null;
  boardType: string;
  layoutId: number;
  sizeId: number;
  setIds: string;
};

type BoardPresenceControlsValue = {
  /** Always true — board presence is on for everyone. Wall surfaces still read this. */
  enabled: boolean;
  /** The board currently bound to the connected serial, or null when none. */
  boardId: number | null;
  /**
   * Resolve (and bind) the shared board for a just-connected serial, then store
   * its boardId so the wall feed subscribes. No-op (resolves null) when no client
   * is available. Idempotent for an unchanged serial.
   */
  resolveAndBindBoard: (args: ResolveBoardArgs) => Promise<ResolvedBoard | null>;
};

const BoardPresenceControlsContext = createContext<BoardPresenceControlsValue | null>(null);

export function WebBoardPresenceProvider({ children }: { children: ReactNode }) {
  // Board presence is always-on (no feature flag).
  const enabled = true;
  const { token } = useWsAuthToken();
  const [boardId, setBoardId] = useState<number | null>(null);

  // Dedicated graphql-ws client for the board-presence feed. Rebuilt when the
  // flag flips on or the auth token changes (so the subscription reconnects
  // authenticated). Exposing the concrete client through state intentionally
  // changes the injected presence-client identity, which makes the shared hook
  // unsubscribe from the disposed socket and resubscribe on the replacement.
  const [activeWsClient, setActiveWsClient] = useState<Client | null>(null);
  const clientRef = useRef<Client | null>(null);

  const presenceClient = useMemo<WebBoardPresenceClient | null>(() => {
    if (activeWsClient === null) return null;
    return createWebBoardPresenceClient(() => {
      const client = clientRef.current;
      if (!client) {
        throw new Error('Board presence WS client is not connected yet');
      }
      return client;
    });
  }, [activeWsClient]);

  useEffect(() => {
    const wsUrl = getBackendWsUrl();
    if (!wsUrl) {
      setActiveWsClient(null);
      return;
    }
    const client = createGraphQLClient({ url: wsUrl, authToken: token, connectionName: 'board-presence' });
    clientRef.current = client;
    setActiveWsClient(client);
    return () => {
      void client.dispose();
      if (clientRef.current === client) {
        clientRef.current = null;
      }
      setActiveWsClient((currentClient) => (currentClient === client ? null : currentClient));
    };
  }, [token]);

  // The wall/config key last resolved, so a reconnect to the same board doesn't
  // re-resolve. Serial boards use the physical serial. Serial-less boards
  // (MoonBoard in v1) use the route config for a shared per-config feed.
  const lastResolvedKeyRef = useRef<string | null>(null);
  // Mirror boardId into a ref so the empty-dep callback can read it without
  // re-resolving an already-bound serial.
  const boardIdRef = useRef(boardId);
  boardIdRef.current = boardId;
  const presenceClientRef = useRef(presenceClient);
  presenceClientRef.current = presenceClient;

  const resolveAndBindBoard = useCallback(async (args: ResolveBoardArgs): Promise<ResolvedBoard | null> => {
    const activeClient = presenceClientRef.current;
    if (activeClient === null) {
      return null;
    }
    const resolveKey =
      args.serial && args.serial.length > 0
        ? `serial:${args.serial}`
        : `config:${args.boardType}:${args.layoutId}:${args.sizeId}:${args.setIds}`;
    if (lastResolvedKeyRef.current === resolveKey && boardIdRef.current !== null) {
      return null;
    }
    const resolved =
      args.serial && args.serial.length > 0
        ? await activeClient.resolveBoardForSerial({
            serial: args.serial,
            boardType: args.boardType,
            layoutId: args.layoutId,
            sizeId: args.sizeId,
            setIds: args.setIds,
          })
        : await activeClient.resolveBoardForConfig({
            boardType: args.boardType,
            layoutId: args.layoutId,
            sizeId: args.sizeId,
            setIds: args.setIds,
          });
    lastResolvedKeyRef.current = resolveKey;
    setBoardId(resolved.boardId);
    return resolved;
  }, []);

  const controls = useMemo<BoardPresenceControlsValue>(
    () => ({ enabled, boardId, resolveAndBindBoard }),
    [enabled, boardId, resolveAndBindBoard],
  );

  return (
    <BoardPresenceControlsContext.Provider value={controls}>
      <BoardPresenceProvider boardId={boardId} client={presenceClient}>
        <BoardNowPlayingInstrument boardId={boardId} />
        {children}
      </BoardPresenceProvider>
    </BoardPresenceControlsContext.Provider>
  );
}

/**
 * Fires `BoardNowPlayingReceived` once per distinct wall climb received from the
 * live feed — instrumenting the "viewed the wall" signal that's invisible
 * today. Lives as a child of `BoardPresenceProvider` so it can read the wall's
 * current climb without the host provider subscribing to it (and re-rendering
 * the whole tree on every wall change). `boardId` is attached as a property,
 * never the raw serial.
 */
function BoardNowPlayingInstrument({ boardId }: { boardId: number | null }) {
  const context = useContext(BoardPresenceCurrentContext);
  const currentClimb = context?.currentClimb ?? null;
  const lastReceivedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!currentClimb) return;
    if (lastReceivedRef.current === currentClimb.climbUuid) return;
    lastReceivedRef.current = currentClimb.climbUuid;
    track(SHARED_EVENTS.BoardNowPlayingReceived, {
      boardId: boardId ?? undefined,
      climbUuid: currentClimb.climbUuid,
    });
  }, [currentClimb, boardId]);
  return null;
}

/**
 * Imperative controls for resolving/binding the board and reading the
 * flag/boardId. Returns a stable no-op fallback when rendered outside the
 * provider, so callers (e.g. a BLE flow that may mount before the provider in
 * tests) never crash.
 */
export function useBoardPresenceControls(): BoardPresenceControlsValue {
  const value = useContext(BoardPresenceControlsContext);
  return value ?? DISABLED_CONTROLS;
}

const DISABLED_CONTROLS: BoardPresenceControlsValue = {
  enabled: false,
  boardId: null,
  resolveAndBindBoard: async () => null,
};

/**
 * The wall's report action, read safely. Unlike the throwing shared hooks, this
 * returns inert no-ops when rendered outside the provider — so the BLE flow,
 * which may mount before/without the presence provider in tests, never crashes.
 * The BluetoothProvider uses this to fire `reportClimb` on a wall confirm.
 */
export function useOptionalWallReport(): Pick<
  UseBoardPresenceResult,
  'currentClimb' | 'previousClimb' | 'reportClimb'
> {
  const currentContext = useContext(BoardPresenceCurrentContext);
  const actionsContext = useContext(BoardPresenceActionsContext);
  if (!currentContext || !actionsContext) return DISABLED_WALL_REPORT;
  return {
    currentClimb: currentContext.currentClimb,
    previousClimb: currentContext.previousClimb,
    reportClimb: actionsContext.reportClimb,
  };
}

const DISABLED_WALL_REPORT: Pick<UseBoardPresenceResult, 'currentClimb' | 'previousClimb' | 'reportClimb'> = {
  currentClimb: null,
  previousClimb: null,
  reportClimb: async (_climb: ClimbQueueItemInput, _angle: number | null) => false,
};

export { BoardPresenceControlsContext };
