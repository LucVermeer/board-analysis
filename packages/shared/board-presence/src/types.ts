/**
 * Pure board-presence ("now on the wall") state machine types.
 * No React, no DOM, no react-native — works in any JS runtime.
 *
 * The wire types (`BoardPresenceClimb`, `BoardPresenceEvent`, etc.) live in
 * `@boardsesh/shared-schema`; this package only owns the reducer state and
 * action shapes. The React wrapper (a `useReducer` hook bound to a GraphQL
 * subscription) lives in a separate `@boardsesh/board-presence-react` package.
 */

import type { BoardPresenceClimb } from '@boardsesh/shared-schema';

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
};

export type BoardPresenceAction =
  | { type: 'APPLY_CLIMB_SET'; payload: BoardPresenceClimb }
  | { type: 'APPLY_CLIMB_CLEARED'; payload: { clearedAt: string; seq: number } }
  | { type: 'BACKFILL_HISTORY'; payload: BoardPresenceClimb[] }
  | { type: 'RESET' };
