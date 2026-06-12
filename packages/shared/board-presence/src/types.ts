/**
 * Pure board-presence ("now on the wall") state machine types.
 * No React, no DOM, no react-native — works in any JS runtime.
 *
 * The wire types (`BoardPresenceClimb`, `BoardPresenceEvent`, etc.) live in
 * `@boardsesh/shared-schema`; this package only owns the reducer state and
 * action shapes. The React wrapper (a `useReducer` hook bound to a GraphQL
 * subscription) lives in a separate `@boardsesh/board-presence-react` package.
 */

import type { BoardPresenceClimb, BoardPresenceStats } from '@boardsesh/shared-schema';

/**
 * The wall's "now playing" state, driven by the per-board presence stream.
 *
 * - `currentClimb`: the climb currently lit on the wall, or `null` if cleared.
 * - `previousClimb`: the climb that was current before the latest set/clear,
 *   so the UI can offer an Undo affordance.
 * - `history`: newest-first list of climbs that have been on the wall, capped
 *   at {@link HISTORY_CAP}.
 * - `lastSeq`: the highest per-board sequence number applied so far. Used to
 *   dedup the late-joiner backfill against the live stream and to reject
 *   out-of-order Redis messages.
 */
export type BoardPresenceState = {
  currentClimb: BoardPresenceClimb | null;
  previousClimb: BoardPresenceClimb | null;
  history: BoardPresenceClimb[];
  lastSeq: number;
  /**
   * The board's durable stat snapshot (sends/climbers/hardest/top), pushed live
   * over the same subscription as climb events. Null until the first seed/push.
   */
  stats: BoardPresenceStats | null;
  /**
   * Highest stats-event `seq` applied. Stats events share the per-board seq
   * counter with climb events, so an out-of-order/duplicate stats push (seq <=
   * this) is ignored. Separate from `lastSeq` so a stats push never advances the
   * climb-ordering cursor (and vice versa).
   */
  lastStatsSeq: number;
};

export type BoardPresenceAction =
  | { type: 'APPLY_CLIMB_SET'; payload: BoardPresenceClimb }
  | { type: 'APPLY_CLIMB_CLEARED'; payload: { clearedAt: string; seq: number } }
  | { type: 'BACKFILL_HISTORY'; payload: BoardPresenceClimb[] }
  // Live stats push from the subscription (the freshly recomputed snapshot).
  | { type: 'APPLY_STATS_UPDATED'; payload: { stats: BoardPresenceStats; seq: number } }
  // One-time initial fetch seed; only fills the tiles before any live push.
  | { type: 'SEED_STATS'; payload: BoardPresenceStats }
  | { type: 'RESET' };
