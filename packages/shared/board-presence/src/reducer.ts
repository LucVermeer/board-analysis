/**
 * Pure board-presence state reducer. No React, no DOM — works in any JS
 * runtime. The React `useReducer` wrapper lives in a separate
 * `@boardsesh/board-presence-react` package.
 *
 * Ordering & dedup model: every presence event carries a monotonic per-board
 * `seq`. A late joiner backfills history (one batch) and then follows the live
 * stream, so the same `(climbUuid, seq)` can arrive twice; Redis fan-out can
 * also deliver messages out of order. The reducer is therefore idempotent and
 * ignores anything at or below the highest `seq` it has already applied so the
 * wall never regresses or double-applies.
 */

import type { BoardPresenceClimb } from '@boardsesh/shared-schema';
import type { BoardPresenceState, BoardPresenceAction } from './types';

/** Newest-first history is capped so a long session can't grow unbounded. */
export const HISTORY_CAP = 50;

export const initialBoardPresenceState: BoardPresenceState = {
  currentClimb: null,
  previousClimb: null,
  history: [],
  lastSeq: 0,
};

/** True when an entry with the same `(climbUuid, seq)` is already in history. */
function historyHasEntry(history: BoardPresenceClimb[], climb: BoardPresenceClimb): boolean {
  return history.some((entry) => entry.climbUuid === climb.climbUuid && entry.seq === climb.seq);
}

/** Merge into history, dedup by `(climbUuid, seq)`, sort newest-first, cap. */
function mergeHistory(existing: BoardPresenceClimb[], incoming: BoardPresenceClimb[]): BoardPresenceClimb[] {
  const byKey = new Map<string, BoardPresenceClimb>();
  for (const climb of [...existing, ...incoming]) {
    byKey.set(`${climb.climbUuid}:${climb.seq}`, climb);
  }
  return Array.from(byKey.values())
    .sort((left, right) => right.seq - left.seq)
    .slice(0, HISTORY_CAP);
}

export function boardPresenceReducer(state: BoardPresenceState, action: BoardPresenceAction): BoardPresenceState {
  switch (action.type) {
    case 'APPLY_CLIMB_SET': {
      const incomingClimb = action.payload;

      // Dedup + ordering: ignore anything we've already advanced past, and any
      // exact `(climbUuid, seq)` we've already recorded. This makes the
      // late-joiner backfill + live stream safe to interleave and rejects
      // out-of-order Redis messages that would otherwise regress the wall.
      if (incomingClimb.seq <= state.lastSeq || historyHasEntry(state.history, incomingClimb)) {
        return state;
      }

      return {
        currentClimb: incomingClimb,
        previousClimb: state.currentClimb,
        history: [incomingClimb, ...state.history].slice(0, HISTORY_CAP),
        lastSeq: Math.max(state.lastSeq, incomingClimb.seq),
      };
    }

    case 'APPLY_CLIMB_CLEARED': {
      // Only honour a clear that is strictly newer than everything applied so
      // far; a stale/duplicate clear must not wipe a climb set after it.
      if (action.payload.seq <= state.lastSeq) {
        return state;
      }

      return {
        ...state,
        currentClimb: null,
        previousClimb: state.currentClimb,
        lastSeq: action.payload.seq,
      };
    }

    case 'BACKFILL_HISTORY': {
      const backfill = action.payload;
      if (backfill.length === 0) {
        return state;
      }

      const mergedHistory = mergeHistory(state.history, backfill);
      const highestSeq = backfill.reduce((highest, climb) => Math.max(highest, climb.seq), state.lastSeq);

      // The newest-by-seq item across the merged history is the candidate for
      // "current". Only adopt it when we have no live current yet, or the live
      // current is older — never clobber a newer climb already applied from the
      // live stream.
      const newestHistoryClimb = mergedHistory[0] ?? null;
      const shouldAdoptHistoryClimb =
        newestHistoryClimb !== null && (state.currentClimb === null || newestHistoryClimb.seq > state.currentClimb.seq);

      return {
        ...state,
        currentClimb: shouldAdoptHistoryClimb ? newestHistoryClimb : state.currentClimb,
        history: mergedHistory,
        lastSeq: highestSeq,
      };
    }

    case 'RESET':
      return initialBoardPresenceState;

    default:
      return state;
  }
}
