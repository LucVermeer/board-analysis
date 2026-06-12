// MobileBoardPresenceProvider — wires the renderer-agnostic
// `@boardsesh/board-presence-react` into the mobile app.
//
// It owns two things:
//   1. The connected `boardId` (resolved from the BLE serial on connect). This
//      is the channel key the wall feed is keyed on.
//   2. A mobile `BoardPresenceClient` (graphql-ws transport) handed to the
//      shared `BoardPresenceProvider`, which runs `useBoardPresence(boardId)`
//      (subscribe + backfill + reducer) and exposes the wall's now-playing
//      state via the split board-presence contexts.
//
// Everything is gated behind the `board-presence` PostHog flag. When the flag is
// off the provider is inert: `boardId` stays null (so the shared hook collapses
// to its empty state) and `resolveAndBindBoard` is a no-op, so the BLE flow and
// every wall surface behave exactly as today.
//
// The bluetooth provider (mounted inside this one) calls
// `useBoardPresenceControls()` to (a) resolve+store the boardId on connect and
// (b) report a freshly-lit climb on wall-confirm. Reads of the wall's current
// climb go through `@boardsesh/board-presence-react`'s split contexts.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BoardPresenceProvider } from '@boardsesh/board-presence-react';
import type { BoardPresenceClient } from '@boardsesh/board-presence-react';
import type { ClimbQueueItemInput, ResolvedBoard } from '@boardsesh/shared-schema';
import { createMobileBoardPresenceClient } from '../lib/board-presence/board-presence-client';
import { getWsClient } from '../lib/graphql/ws-client';
import { useFeatureFlag } from './feature-flags-provider';

/** Board config needed to find-or-bind the shared board on first sighting. */
export type ResolveBoardArgs = {
  serial: string;
  boardType: string;
  layoutId: number;
  sizeId: number;
  setIds: string;
};

export type ResolveBoardConfigArgs = Omit<ResolveBoardArgs, 'serial'>;

export type ResolveBoardUuidArgs = {
  boardUuid: string;
};

function boardConfigResolveKey({ boardType, layoutId, sizeId, setIds }: ResolveBoardConfigArgs): string {
  return `${boardType}:${layoutId}:${sizeId}:${setIds}`;
}

type BoardPresenceControlsValue = {
  /** True when the `board-presence` flag is on. All wall surfaces gate on this. */
  enabled: boolean;
  /** The board currently bound to the connected serial, or null when none. */
  boardId: number | null;
  /**
   * Resolve (and bind) the shared board for a just-connected serial, then store
   * its boardId so the wall feed subscribes. No-op (resolves null) when the flag
   * is off or no client is available. Idempotent for an unchanged serial.
   */
  resolveAndBindBoard: (args: ResolveBoardArgs) => Promise<ResolvedBoard | null>;
  /**
   * Resolve a board by config when no serial is available, then store its
   * boardId. No-op when the active transport does not support config fallback.
   */
  resolveAndBindBoardByConfig: (args: ResolveBoardConfigArgs) => Promise<ResolvedBoard | null>;
  /**
   * Resolve a selected named board by UUID, then store its boardId. This is the
   * preferred non-BLE path for board sheet stats/history.
   */
  resolveAndBindBoardByUuid: (args: ResolveBoardUuidArgs) => Promise<ResolvedBoard | null>;
  /**
   * Report directly to a specific board id. Used immediately after a connect
   * resolve when the React boardId context has not re-rendered yet.
   */
  reportClimbForBoard: (boardId: number, climb: ClimbQueueItemInput, angle: number | null) => Promise<boolean>;
  /** Clear the current board binding and force the shared presence hook inert. */
  resetPresence: () => void;
};

const BoardPresenceControlsContext = createContext<BoardPresenceControlsValue | null>(null);

export function MobileBoardPresenceProvider({ children }: { children: ReactNode }) {
  const enabled = useFeatureFlag('board-presence') === true;
  const [boardId, setBoardId] = useState<number | null>(null);

  // The injected transport. Built once and only while the flag is on, so the
  // shared hook never attaches a subscription when the feature is disabled.
  const client = useMemo<BoardPresenceClient | null>(
    () => (enabled ? createMobileBoardPresenceClient(getWsClient) : null),
    [enabled],
  );
  const clientRef = useRef(client);
  clientRef.current = client;

  // The serial last resolved, so a reconnect to the same wall doesn't re-resolve.
  const lastResolvedSerialRef = useRef<string | null>(null);
  const lastResolvedConfigKeyRef = useRef<string | null>(null);
  const lastResolvedBoardUuidRef = useRef<string | null>(null);
  const resolveGenerationRef = useRef(0);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  // Mirror boardId into a ref so the empty-dep callback can read it without
  // re-resolving an already-bound serial.
  const boardIdRef = useRef(boardId);
  boardIdRef.current = boardId;

  const resetPresence = useCallback(() => {
    lastResolvedSerialRef.current = null;
    lastResolvedConfigKeyRef.current = null;
    lastResolvedBoardUuidRef.current = null;
    resolveGenerationRef.current += 1;
    setBoardId(null);
  }, []);

  useEffect(() => {
    if (!enabled) {
      resetPresence();
    }
  }, [enabled, resetPresence]);

  const resolveAndBindBoard = useCallback(async (args: ResolveBoardArgs): Promise<ResolvedBoard | null> => {
    const activeClient = clientRef.current;
    if (!enabledRef.current || activeClient === null) {
      return null;
    }
    if (lastResolvedSerialRef.current === args.serial && boardIdRef.current !== null) {
      return null;
    }
    const resolveGeneration = resolveGenerationRef.current + 1;
    resolveGenerationRef.current = resolveGeneration;
    lastResolvedConfigKeyRef.current = null;
    lastResolvedBoardUuidRef.current = null;
    lastResolvedSerialRef.current = args.serial;
    setBoardId(null);
    try {
      const resolved = await activeClient.resolveBoardForSerial(args);
      if (resolveGenerationRef.current !== resolveGeneration) {
        return null;
      }
      setBoardId(resolved.boardId);
      return resolved;
    } catch (error) {
      if (resolveGenerationRef.current === resolveGeneration) {
        lastResolvedSerialRef.current = null;
      }
      console.warn('[board-presence] resolveBoardForSerial failed', error);
      return null;
    }
  }, []);

  const resolveAndBindBoardByUuid = useCallback(async (args: ResolveBoardUuidArgs): Promise<ResolvedBoard | null> => {
    const activeClient = clientRef.current;
    if (!enabledRef.current || activeClient === null || !activeClient.resolveBoardForUuid) {
      return null;
    }
    if (lastResolvedBoardUuidRef.current === args.boardUuid) {
      return null;
    }
    const resolveGeneration = resolveGenerationRef.current + 1;
    resolveGenerationRef.current = resolveGeneration;
    lastResolvedBoardUuidRef.current = args.boardUuid;
    lastResolvedConfigKeyRef.current = null;
    lastResolvedSerialRef.current = null;
    setBoardId(null);
    try {
      const resolved = await activeClient.resolveBoardForUuid(args);
      if (resolveGenerationRef.current !== resolveGeneration) {
        return null;
      }
      setBoardId(resolved.boardId);
      return resolved;
    } catch (error) {
      if (resolveGenerationRef.current === resolveGeneration) {
        lastResolvedBoardUuidRef.current = null;
      }
      console.warn('[board-presence] resolveBoardForUuid failed', error);
      return null;
    }
  }, []);

  const resolveAndBindBoardByConfig = useCallback(
    async (args: ResolveBoardConfigArgs): Promise<ResolvedBoard | null> => {
      const activeClient = clientRef.current;
      if (!enabledRef.current || activeClient === null || !activeClient.resolveBoardForConfig) {
        return null;
      }
      const configKey = boardConfigResolveKey(args);
      if (lastResolvedConfigKeyRef.current === configKey && boardIdRef.current !== null) {
        return null;
      }
      const resolveGeneration = resolveGenerationRef.current + 1;
      resolveGenerationRef.current = resolveGeneration;
      lastResolvedConfigKeyRef.current = configKey;
      lastResolvedBoardUuidRef.current = null;
      lastResolvedSerialRef.current = null;
      setBoardId(null);
      try {
        const resolved = await activeClient.resolveBoardForConfig(args);
        if (resolveGenerationRef.current !== resolveGeneration || lastResolvedConfigKeyRef.current !== configKey) {
          return null;
        }
        setBoardId(resolved.boardId);
        return resolved;
      } catch (error) {
        if (resolveGenerationRef.current === resolveGeneration && lastResolvedConfigKeyRef.current === configKey) {
          lastResolvedConfigKeyRef.current = null;
        }
        console.warn('[board-presence] resolveBoardForConfig failed', error);
        return null;
      }
    },
    [],
  );

  const reportClimbForBoard = useCallback(
    async (targetBoardId: number, climb: ClimbQueueItemInput, angle: number | null): Promise<boolean> => {
      const activeClient = clientRef.current;
      if (!enabledRef.current || activeClient === null) {
        return false;
      }
      try {
        return await activeClient.reportClimb(targetBoardId, climb, angle);
      } catch (error) {
        console.warn('[board-presence] reportBoardClimb failed', error);
        return false;
      }
    },
    [],
  );

  const controls = useMemo<BoardPresenceControlsValue>(
    () => ({
      enabled,
      boardId,
      resolveAndBindBoard,
      resolveAndBindBoardByConfig,
      resolveAndBindBoardByUuid,
      reportClimbForBoard,
      resetPresence,
    }),
    [
      enabled,
      boardId,
      resolveAndBindBoard,
      resolveAndBindBoardByConfig,
      resolveAndBindBoardByUuid,
      reportClimbForBoard,
      resetPresence,
    ],
  );

  return (
    <BoardPresenceControlsContext.Provider value={controls}>
      <BoardPresenceProvider boardId={enabled ? boardId : null} client={client}>
        {children}
      </BoardPresenceProvider>
    </BoardPresenceControlsContext.Provider>
  );
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
  resolveAndBindBoardByConfig: async () => null,
  resolveAndBindBoardByUuid: async () => null,
  reportClimbForBoard: async () => false,
  resetPresence: () => {},
};

export { BoardPresenceControlsContext };
