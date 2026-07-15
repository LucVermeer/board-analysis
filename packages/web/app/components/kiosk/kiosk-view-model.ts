// Pure derivation of what a kiosk page renders from the GET_GYM_KIOSK payload.
// Server-safe (no React) so the server renderer and tests share one code path.

import {
  kioskPresetForBoardCount,
  parseKioskLayoutLenient,
  type KioskLeaderboardPeriod,
  type KioskPreset,
} from '@boardsesh/kiosk';
import type { GymKiosk, GymKioskBoard } from '@boardsesh/shared-schema';

export type KioskLeaderboardConfig = {
  /** Scope: a single kiosk board's uuid, or null for every board on the kiosk. */
  boardUuid: string | null;
  period: KioskLeaderboardPeriod;
};

export type KioskViewModel = {
  /**
   * The boards the kiosk renders, in slot order. This is the backend-RESOLVED
   * list (viewer-hidden and dead boards already omitted) — never re-derived
   * from `layout.boards`.
   */
  boards: GymKioskBoard[];
  /**
   * Preset derived from the RESOLVED board count. A slot whose board was
   * omitted server-side simply collapses (quad degrades to triple); zero
   * renderable boards yields `null` → the "isn't set up yet" placeholder.
   */
  preset: KioskPreset | null;
  /** Leaderboard rail config, or null when the rail is off. */
  leaderboard: KioskLeaderboardConfig | null;
};

/**
 * Build the render model for a kiosk. `layout` is the raw JSON scalar off the
 * wire — parsed leniently here, NEVER trusted as-is (the backend also returns
 * the lenient parse, but a defence-in-depth reparse costs nothing and keeps
 * this function total over arbitrary input).
 *
 * A leaderboard scoped to a board that is NOT in the resolved list (e.g. a
 * non-public board hidden from this viewer) is widened to all-boards rather
 * than dropped — mirroring `parseKioskLayoutLenient`'s treatment of a scope
 * pointing at a removed slot. Ranking an invisible wall would leak nothing
 * useful and an empty rail would look broken, so the rail falls back to the
 * boards the viewer can actually see.
 */
export function buildKioskViewModel(kiosk: Pick<GymKiosk, 'layout' | 'boards'>): KioskViewModel {
  const { layout } = parseKioskLayoutLenient(kiosk.layout);
  const boards = kiosk.boards;

  let leaderboard: KioskLeaderboardConfig | null = layout.leaderboard;
  const scopedBoardUuid = leaderboard?.boardUuid ?? null;
  if (
    leaderboard !== null &&
    scopedBoardUuid !== null &&
    !boards.some((board) => board.boardUuid === scopedBoardUuid)
  ) {
    // Review-accepted inconsistency: for a CORRUPT stored config the scope can
    // widen twice — once in the lenient parser (relative to layout.boards) and
    // once here (relative to the resolved list) — so what a corrupt config's
    // rail shows isn't perfectly round-trippable with the editor. Accepted:
    // corrupt configs are a repair path, not a product state.
    leaderboard = { ...leaderboard, boardUuid: null };
  }

  return {
    boards,
    preset: kioskPresetForBoardCount(boards.length),
    leaderboard,
  };
}
