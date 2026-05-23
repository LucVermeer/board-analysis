import type { ClimbCompatibilityInput, BoardCompatibilityTarget } from './types';

/**
 * Parse an Aurora-format climb frames string into an array of hold IDs.
 *
 * Frames look like `p1234r15p5678r12...` where each `p{holdId}r{stateCode}`
 * pair describes a single hold placement. Returns an empty array for
 * empty, malformed, or nullish input.
 */
export function parseClimbFrameHoldIds(frames: string | null | undefined): number[] {
  if (!frames) return [];
  const ids: number[] = [];
  const pattern = /p(\d+)r-?\d+/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(frames)) !== null) {
    const id = Number(match[1]);
    if (Number.isFinite(id)) ids.push(id);
  }
  return ids;
}

export type BoardCompatibilityResult =
  | { ok: true }
  | { ok: false; reason: 'board_name' | 'layout' | 'holds_out_of_range' };

// Cache valid hold ID sets per BoardCompatibilityTarget object so repeated queue-add
// validation doesn't rebuild the Set on every call.
const validHoldIdCache = new WeakMap<BoardCompatibilityTarget, Set<number>>();

function getValidHoldIds(target: BoardCompatibilityTarget): Set<number> | null {
  // If the target board is missing holdsData (which can happen in tests or
  // when a board is stubbed without render data), we can't run the hold-ID
  // containment check. Callers treat a null set as "no per-hold check".
  if (!target.holdsData || !Array.isArray(target.holdsData) || target.holdsData.length === 0) {
    return null;
  }
  const cached = validHoldIdCache.get(target);
  if (cached) return cached;
  const set = new Set<number>();
  for (const hold of target.holdsData) {
    set.add(hold.id);
  }
  validHoldIdCache.set(target, set);
  return set;
}

/**
 * Determine whether a climb can be added to a queue bound to `target`.
 *
 * Rules:
 *  1. `climb.boardType` must match `target.board_name` when set.
 *  2. `climb.layoutId` must match `target.layout_id` when set.
 *  3. Every hold ID referenced in `climb.frames` must exist on the target
 *     board. This naturally allows smaller boards to be added to larger
 *     queues (subset of holds) but rejects larger-board climbs that use
 *     holds missing on a smaller board.
 */
export function canAddClimbToBoard(
  climb: ClimbCompatibilityInput,
  target: BoardCompatibilityTarget,
): BoardCompatibilityResult {
  if (climb.boardType && climb.boardType !== target.board_name) {
    return { ok: false, reason: 'board_name' };
  }
  if (climb.layoutId != null && climb.layoutId !== target.layout_id) {
    return { ok: false, reason: 'layout' };
  }
  const validIds = getValidHoldIds(target);
  if (!validIds) {
    // Target has no usable hold render data — accept the climb rather
    // than blocking it. Layout/board_name already covers the common
    // case, and the WASM renderer will ignore unknown hold IDs at draw
    // time if something slips through.
    return { ok: true };
  }
  const climbHoldIds = parseClimbFrameHoldIds(climb.frames);
  for (const id of climbHoldIds) {
    if (!validIds.has(id)) {
      return { ok: false, reason: 'holds_out_of_range' };
    }
  }
  return { ok: true };
}
