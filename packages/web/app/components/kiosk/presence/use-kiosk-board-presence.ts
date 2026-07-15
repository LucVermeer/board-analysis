'use client';

// Read-side of the kiosk presence hub. The hub (kiosk-presence-hub.tsx) runs
// one BoardPresenceProvider per distinct board over a single shared graphql-ws
// client and publishes each board's live snapshot into the Map context below;
// widgets (board slots, the session leaderboard) read per-board through these
// hooks without mounting their own subscriptions.

import { createContext, useContext } from 'react';
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

export const KioskPresenceSnapshotsContext = createContext<ReadonlyMap<number, KioskBoardSnapshot> | null>(null);

export const KioskConnectionStatusContext = createContext<KioskConnectionStatus>('connecting');

/**
 * One board's live snapshot, or null before its feed has published anything
 * (SSR and the pre-subscription window — callers fall back to server-seeded
 * initial data).
 */
export function useKioskBoardPresence(boardId: number): KioskBoardSnapshot | null {
  const snapshots = useContext(KioskPresenceSnapshotsContext);
  if (snapshots === null) {
    throw new Error('useKioskBoardPresence must be used within a KioskPresenceHub');
  }
  return snapshots.get(boardId) ?? null;
}

/** Every published board snapshot, for cross-board readers (session leaderboard). */
export function useKioskPresenceSnapshots(): ReadonlyMap<number, KioskBoardSnapshot> {
  const snapshots = useContext(KioskPresenceSnapshotsContext);
  if (snapshots === null) {
    throw new Error('useKioskPresenceSnapshots must be used within a KioskPresenceHub');
  }
  return snapshots;
}

/** Shared ws-client connection status, for the header's "Reconnecting…" chip. */
export function useKioskConnectionStatus(): KioskConnectionStatus {
  return useContext(KioskConnectionStatusContext);
}
