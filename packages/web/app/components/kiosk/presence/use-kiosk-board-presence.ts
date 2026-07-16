'use client';

// Read-side of the kiosk presence hub. The hub (kiosk-presence-hub.tsx) runs
// one BoardPresenceProvider per distinct board over a single shared graphql-ws
// client and publishes each board's live snapshot into the external store below;
// widgets (board slots, the session leaderboard) read per-board through these
// hooks without mounting their own subscriptions.
//
// The store lives OUTSIDE React's render tree: snapshots are held in a Map with
// per-board listener sets and read via useSyncExternalStore, so one board's
// event notifies only its own subscribers. A single wall going live no longer
// re-renders every other board's art on a 24/7 TV — the whole reason this isn't
// just a Map in context (which changes reference on every board's event, forcing
// all consumers to re-render).

import { createContext, useCallback, useContext, useSyncExternalStore } from 'react';
import type { BoardPresenceClimb } from '@boardsesh/shared-schema';

export type KioskBoardSnapshot = {
  /** The climb currently lit on this wall, or null when the wall is clear. */
  currentClimb: BoardPresenceClimb | null;
  /**
   * Newest-first climbs seen on this wall. Capped at 50 per board by the
   * presence reducer (`HISTORY_CAP` in @boardsesh/board-presence) — a very
   * busy session can rank on a truncated window; see the session leaderboard.
   */
  history: BoardPresenceClimb[];
  /** True while the live subscription for this board is attached. */
  isLive: boolean;
};

export type KioskConnectionStatus = 'connecting' | 'connected' | 'reconnecting';

/** Stable empty view returned before any board has published (SSR + boot). */
const EMPTY_SNAPSHOTS: ReadonlyMap<number, KioskBoardSnapshot> = new Map();

/**
 * External store backing the presence hooks. Board snapshots are published
 * imperatively (by the feed bridge) and read through useSyncExternalStore, so a
 * per-board event notifies only that board's subscribers.
 */
export type KioskPresenceStore = {
  /** One board's current snapshot, or null before its feed has published. */
  getBoardSnapshot: (boardId: number) => KioskBoardSnapshot | null;
  /** Subscribe to one board's changes; returns an unsubscribe fn. */
  subscribeBoard: (boardId: number, listener: () => void) => () => void;
  /** Immutable view of every board snapshot (stable ref between publishes). */
  getAllSnapshots: () => ReadonlyMap<number, KioskBoardSnapshot>;
  /** Subscribe to any board's changes (cross-board readers); returns unsubscribe. */
  subscribeAll: (listener: () => void) => () => void;
  /** Publish one board's snapshot up from its BoardPresenceProvider. */
  publish: (boardId: number, snapshot: KioskBoardSnapshot) => void;
};

export function createKioskPresenceStore(): KioskPresenceStore {
  const snapshots = new Map<number, KioskBoardSnapshot>();
  // Rebuilt on each publish so cross-board readers (the leaderboard) see a new
  // reference and recompute; per-board readers ignore it and go through
  // getBoardSnapshot, whose object reference only changes for the board that published.
  let snapshotsView: ReadonlyMap<number, KioskBoardSnapshot> = EMPTY_SNAPSHOTS;
  const boardListeners = new Map<number, Set<() => void>>();
  const allListeners = new Set<() => void>();

  return {
    getBoardSnapshot(boardId) {
      return snapshots.get(boardId) ?? null;
    },
    subscribeBoard(boardId, listener) {
      let listeners = boardListeners.get(boardId);
      if (listeners === undefined) {
        listeners = new Set();
        boardListeners.set(boardId, listeners);
      }
      listeners.add(listener);
      return () => {
        const currentListeners = boardListeners.get(boardId);
        if (currentListeners === undefined) return;
        currentListeners.delete(listener);
        if (currentListeners.size === 0) {
          boardListeners.delete(boardId);
        }
      };
    },
    getAllSnapshots() {
      return snapshotsView;
    },
    subscribeAll(listener) {
      allListeners.add(listener);
      return () => {
        allListeners.delete(listener);
      };
    },
    publish(boardId, snapshot) {
      snapshots.set(boardId, snapshot);
      snapshotsView = new Map(snapshots);
      const listeners = boardListeners.get(boardId);
      if (listeners !== undefined) {
        for (const listener of listeners) listener();
      }
      for (const listener of allListeners) listener();
    },
  };
}

export const KioskPresenceStoreContext = createContext<KioskPresenceStore | null>(null);

export const KioskConnectionStatusContext = createContext<KioskConnectionStatus>('connecting');

function usePresenceStore(hookName: string): KioskPresenceStore {
  const store = useContext(KioskPresenceStoreContext);
  if (store === null) {
    throw new Error(`${hookName} must be used within a KioskPresenceHub`);
  }
  return store;
}

/**
 * One board's live snapshot, or null before its feed has published anything
 * (SSR and the pre-subscription window — callers fall back to server-seeded
 * initial data). Only re-renders when THIS board's snapshot changes.
 */
export function useKioskBoardPresence(boardId: number): KioskBoardSnapshot | null {
  const store = usePresenceStore('useKioskBoardPresence');
  const subscribe = useCallback((listener: () => void) => store.subscribeBoard(boardId, listener), [store, boardId]);
  const getSnapshot = useCallback(() => store.getBoardSnapshot(boardId), [store, boardId]);
  // getServerSnapshot === getSnapshot: on the server no board has published, so
  // both return null, matching the client's first render (SSR-safe hydration).
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Every published board snapshot, for cross-board readers (session leaderboard). */
export function useKioskPresenceSnapshots(): ReadonlyMap<number, KioskBoardSnapshot> {
  const store = usePresenceStore('useKioskPresenceSnapshots');
  const subscribe = useCallback((listener: () => void) => store.subscribeAll(listener), [store]);
  return useSyncExternalStore(subscribe, store.getAllSnapshots, store.getAllSnapshots);
}

/** Shared ws-client connection status, for the header's "Reconnecting…" chip. */
export function useKioskConnectionStatus(): KioskConnectionStatus {
  return useContext(KioskConnectionStatusContext);
}
