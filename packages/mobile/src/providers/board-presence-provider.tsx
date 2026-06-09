// MobileBoardPresenceProvider — wires the renderer-agnostic
// `@boardsesh/board-presence-react` into the mobile app.
//
// It owns two things:
//   1. The connected `boardId` (resolved from the BLE serial on connect). This
//      is the channel key the wall feed is keyed on.
//   2. A mobile `BoardPresenceClient` (graphql-ws transport) handed to the
//      shared `BoardPresenceProvider`, which runs `useBoardPresence(boardId)`
//      (subscribe + backfill + reducer) and exposes the wall's now-playing
//      state via `useBoardPresenceContext`.
//
// Everything is gated behind the `board-presence` PostHog flag. When the flag is
// off the provider is inert: `boardId` stays null (so the shared hook collapses
// to its empty state) and `resolveAndBindBoard` is a no-op, so the BLE flow and
// every wall surface behave exactly as today.
//
// The bluetooth provider (mounted inside this one) calls
// `useBoardPresenceControls()` to (a) resolve+store the boardId on connect and
// (b) report a freshly-lit climb on wall-confirm. Reads of the wall's current
// climb go through `@boardsesh/board-presence-react`'s `useBoardPresenceContext`.

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { BoardPresenceProvider } from '@boardsesh/board-presence-react';
import type { BoardPresenceClient } from '@boardsesh/board-presence-react';
import type { ResolvedBoard } from '@boardsesh/shared-schema';
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
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  // Mirror boardId into a ref so the empty-dep callback can read it without
  // re-resolving an already-bound serial.
  const boardIdRef = useRef(boardId);
  boardIdRef.current = boardId;

  const resolveAndBindBoard = useCallback(async (args: ResolveBoardArgs): Promise<ResolvedBoard | null> => {
    const activeClient = clientRef.current;
    if (!enabledRef.current || activeClient === null) {
      return null;
    }
    if (lastResolvedSerialRef.current === args.serial && boardIdRef.current !== null) {
      return null;
    }
    const resolved = await activeClient.resolveBoardForSerial(args);
    lastResolvedSerialRef.current = args.serial;
    setBoardId(resolved.boardId);
    return resolved;
  }, []);

  const controls = useMemo<BoardPresenceControlsValue>(
    () => ({ enabled, boardId, resolveAndBindBoard }),
    [enabled, boardId, resolveAndBindBoard],
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
};

export { BoardPresenceControlsContext };
