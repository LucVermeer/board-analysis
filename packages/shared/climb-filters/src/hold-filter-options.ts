import { HOLD_STATE_MAP } from '@boardsesh/board-constants/hold-states';
import type { BoardName, HoldFilterEntry, HoldFilterMode, HoldFilterType } from '@boardsesh/shared-schema';

/**
 * Hold-type swatch metadata for the search hold filter, shared by web (the
 * MUI `HoldTypePicker`) and mobile (the native hold-filter sub-screen).
 *
 * The named setting roles (STARTING / HAND / FINISH / FOOT) come from each
 * board's `HOLD_STATE_MAP` so the swatch colour matches the LED colour the
 * board lights. `ANY` is a wildcard that matches a hold present in any state —
 * it has no `HOLD_STATE_MAP` entry, so it renders as a plain white swatch
 * (matching the on-board overlay, which uses `#FFFFFF` for `ANY`).
 */

// Display order of the named setting roles in the picker.
const SETTER_STATE_ORDER: readonly HoldFilterType[] = ['STARTING', 'HAND', 'FINISH', 'FOOT'];

// Membership guard for narrowing `HOLD_STATE_MAP` entry names (a `HoldState`,
// which also includes OFF/NOT/AUX/ANY) down to a selectable `HoldFilterType`.
const SETTER_STATE_ORDER_SET = new Set<string>(SETTER_STATE_ORDER);

// Per-board allowlist of selectable named states. MoonBoard climbs are
// STARTING / HAND / FINISH only — its extra HOLD_STATE_MAP entries exist to
// render live BLE preview frames, not to set climbs, so they're excluded here.
const PICKER_STATES_BY_BOARD: Record<BoardName, readonly HoldFilterType[]> = {
  kilter: SETTER_STATE_ORDER,
  tension: SETTER_STATE_ORDER,
  decoy: SETTER_STATE_ORDER,
  touchstone: SETTER_STATE_ORDER,
  grasshopper: SETTER_STATE_ORDER,
  soill: SETTER_STATE_ORDER,
  moonboard: ['STARTING', 'HAND', 'FINISH'],
};

/** Plain-white swatch colour for the `ANY` wildcard (no LED colour of its own). */
export const ANY_HOLD_COLOR = '#FFFFFF';

export type HoldFilterOption = {
  type: HoldFilterType;
  /** Swatch / ring colour. */
  color: string;
};

/**
 * Build the ordered list of hold-type filter options for a board: the named
 * setting roles (board-filtered) followed by the `ANY` wildcard.
 */
export function buildHoldFilterOptions(boardName: BoardName): HoldFilterOption[] {
  const boardMap = HOLD_STATE_MAP[boardName];
  const colorByState = new Map<HoldFilterType, string>();
  if (boardMap) {
    for (const entry of Object.values(boardMap)) {
      // Skip non-selectable states (OFF / NOT / AUX / ANY) so the narrowing to
      // HoldFilterType is sound — no unsafe cast.
      if (!SETTER_STATE_ORDER_SET.has(entry.name)) continue;
      const name = entry.name as HoldFilterType;
      if (!colorByState.has(name)) colorByState.set(name, entry.displayColor ?? entry.color);
    }
  }

  const options: HoldFilterOption[] = [];
  for (const type of PICKER_STATES_BY_BOARD[boardName] ?? SETTER_STATE_ORDER) {
    const color = colorByState.get(type);
    if (!color) continue;
    options.push({ type, color });
  }
  options.push({ type: 'ANY', color: ANY_HOLD_COLOR });
  return options;
}

/**
 * Apply a single swatch tap to a hold's filter entry, given a global
 * include/exclude apply-mode. Returns the next entry (an empty object means the
 * hold should be dropped from the filter).
 *
 *   - type unset           → set to apply-mode
 *   - type already at mode  → unset
 *   - type at the other mode → flip to apply-mode
 *
 * Mirrors the web `HoldTypePicker` tap semantics so both platforms behave the
 * same.
 */
export function toggleHoldFilterType(
  entry: HoldFilterEntry,
  type: HoldFilterType,
  applyMode: HoldFilterMode,
): HoldFilterEntry {
  const next: HoldFilterEntry = { ...entry };
  if (next[type] === applyMode) {
    delete next[type];
  } else {
    next[type] = applyMode;
  }
  return next;
}

/** Number of holds that carry at least one active type filter. */
export function countFilteredHolds(holdsFilter: Record<string, HoldFilterEntry> | undefined): number {
  if (!holdsFilter) return 0;
  let count = 0;
  for (const entry of Object.values(holdsFilter)) {
    if (entry && Object.keys(entry).length > 0) count += 1;
  }
  return count;
}
