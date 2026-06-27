// Source-of-truth selector for the "On the wall" status strip.
//
// The wall's lit climb used to override the bottom accessory (the queue bar). It
// no longer does — the accessory shows the local queue head only. Instead, the
// wall's lit climb gets its own surface (the WallStatusCapsule), and only when it
// DIFFERS from the local queue head: in the common solo case the climb you lit IS
// your queue head, so the bottom bar already shows it and the strip stays hidden.
//
// PERF (RN hot-path checklist): this read is O(1) — it uses only the current wall
// climb from the split presence context and never scans history. It re-renders on
// a wall event (bounded, not per-frame), which is exactly when the strip's content
// must change.

import { useMemo } from 'react';
import type { BoardPresenceClimb } from '@boardsesh/shared-schema';
import { useBoardPresenceCurrent } from '@boardsesh/board-presence-react';
import { useBoardPresenceControls } from '../../providers/board-presence-provider';

/**
 * Returns the wall's lit climb ONLY when a board feed is live AND that climb is
 * different from the local queue head; otherwise `null`.
 *
 * Returns the RAW `BoardPresenceClimb` (not the minimal converted `Climb`) so the
 * capsule can show the sender — `sentByDisplayName`/`sentByAvatarUrl`/`sentByUserId`
 * — which `boardPresenceClimbToClimb` drops. Convert to a `Climb` at the point of
 * use (e.g. opening the play drawer).
 *
 * Pass the local queue head's uuid as `localClimbUuid` (e.g. from the narrow
 * `useActiveClimbUuid()` selector, so the caller doesn't subscribe to the whole
 * reducer state). When the wall climb equals it (the solo case — you lit your own
 * current climb), this returns `null` so the capsule stays hidden and the climb
 * isn't shown twice (top capsule + bottom queue bar). The capsule self-gates on a
 * `null` return, so no separate presence gate is needed.
 */
export function useWallClimbIfDistinct(localClimbUuid: string | null): BoardPresenceClimb | null {
  const { enabled, boardId } = useBoardPresenceControls();
  const { currentClimb: wallClimb, isLive } = useBoardPresenceCurrent();

  // `wallClimb` only changes on a wall event (bounded, not per-frame), so the memo
  // recomputes off a stable input set and the read stays O(1) on the hot path.
  return useMemo(() => {
    const live = enabled && boardId !== null && isLive && wallClimb !== null;
    if (!live || !wallClimb) return null;
    // Hide when the wall is showing the user's own current climb — the bottom
    // queue bar already carries it.
    if (wallClimb.climbUuid === localClimbUuid) return null;
    return wallClimb;
  }, [enabled, boardId, isLive, wallClimb, localClimbUuid]);
}
