import type { BoardName } from '@boardsesh/shared-schema';

/**
 * The applied filter for the Find Gym ("Wall Finder") screen.
 *
 * Collapses what used to be two loose strings (`inputText` raw + `query`
 * applied) into one object so the search bar's two jobs and the board-type
 * filter compose cleanly:
 *
 * - `name` — the applied name filter (gyms/boards `ILIKE`). Mutually exclusive
 *   with `place`: a typed place RELOCATES the map (it is not a filter term), so
 *   the two are never ANDed (a place like "Tokyo" would otherwise hide every gym
 *   not literally named after it).
 * - `place` — the label of a geocoded place search ("Showing <place>"); the
 *   camera move itself is viewport state, not stored here.
 * - `boardTypes` — selected board types (Kilter / Tension / MoonBoard),
 *   multi-select OR. ANDs with `name` and the current viewport. Wired by the
 *   board-type chips; until those ship it stays empty, so behaviour is unchanged.
 *
 * `viewCenter` / `searchLabel` stay separate viewport state on the screen — this
 * is the FILTER, not the camera.
 */
export type WallFinderFilter = {
  place?: string;
  name?: string;
  boardTypes?: BoardName[];
};

export const DEFAULT_WALL_FINDER_FILTER: WallFinderFilter = {};

/** True when any filter term is set (a name filter or one or more board types). */
export function hasActiveWallFinderFilter(filter: WallFinderFilter): boolean {
  return Boolean(filter.name && filter.name.length > 0) || (filter.boardTypes?.length ?? 0) > 0;
}
