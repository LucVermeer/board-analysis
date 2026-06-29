import type { BoardName } from '@boardsesh/shared-schema';
import { getSizesForLayoutId, getSetsForLayoutAndSize, getAllLayouts } from '@boardsesh/board-constants/product-sizes';
import { MOONBOARD_LAYOUTS, MOONBOARD_SETS, MOONBOARD_SIZE, type MoonBoardLayoutKey } from '@boardsesh/board-config';

export type PlaylistBoardConfig = {
  boardName: BoardName;
  layoutId: number;
  sizeId: number;
  setIds: number[];
};

function getDefaultLayoutId(boardName: BoardName): number | null {
  const layouts = getAllLayouts(boardName);
  return layouts.length > 0 ? layouts[0].id : null;
}

// The board metadata behind a (boardType, layoutId) key is static, so the
// resolved config never changes — memoise it. Callers hit this per row in
// virtualised lists (session ticks, logbook) and the compute runs a sizes
// filter + largest-area reduce, so the cache keeps repeat lookups O(1). The
// FIFO cap just bounds memory; the real key space (every board × layout) sits
// well under the limit, so it effectively never evicts.
const BOARD_CONFIG_CACHE_LIMIT = 64;
const boardConfigCache = new Map<string, PlaylistBoardConfig | null>();

/**
 * Resolve a renderable board config (largest size + all its sets) for a
 * playlist that only carries `boardType` + `layoutId`. Mobile mirror of web's
 * `getBoardDetailsForPlaylist`, returning the minimal config the bundled
 * background cache needs. Handles Aurora boards (kilter/tension) via the
 * product-size tables and MoonBoard via its own layout/set config. Returns null
 * when the board/layout can't resolve so the caller falls back cleanly to the
 * plain colour tile. Memoised by board key.
 */
export function getBoardConfigForPlaylist(
  boardType: string,
  layoutId: number | null | undefined,
): PlaylistBoardConfig | null {
  const cacheKey = `${boardType}-${layoutId ?? ''}`;
  const cached = boardConfigCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const result = computeBoardConfigForPlaylist(boardType, layoutId);
  if (boardConfigCache.size >= BOARD_CONFIG_CACHE_LIMIT) {
    const oldestKey = boardConfigCache.keys().next().value;
    if (oldestKey !== undefined) boardConfigCache.delete(oldestKey);
  }
  boardConfigCache.set(cacheKey, result);
  return result;
}

function computeBoardConfigForPlaylist(
  boardType: string,
  layoutId: number | null | undefined,
): PlaylistBoardConfig | null {
  // `boardType` is a free-form string off the playlist record. Force it to
  // BoardName (project convention: `as unknown as` for unsafe casts) and lean on
  // the board-constants lookups below returning empty for anything unknown — we
  // return null (→ plain colour tile) rather than rendering a bad board, so the
  // cast is safe at runtime.
  const boardName = boardType as unknown as BoardName;

  // MoonBoard isn't in the Aurora product-size tables — it has a single fixed
  // size and its own layout/set config. Mirror web's `getMoonBoardDetailsForPlaylist`.
  if (boardName === 'moonboard') {
    return computeMoonBoardConfigForPlaylist(layoutId);
  }

  const effectiveLayoutId = layoutId ?? getDefaultLayoutId(boardName);
  if (!effectiveLayoutId) return null;

  const sizes = getSizesForLayoutId(boardName, effectiveLayoutId);
  if (sizes.length === 0) return null;

  // Largest-area size (web does the same — playlists have no session size).
  const largest = sizes.reduce((best, size) => {
    const area = (size.edgeRight - size.edgeLeft) * (size.edgeTop - size.edgeBottom);
    const bestArea = (best.edgeRight - best.edgeLeft) * (best.edgeTop - best.edgeBottom);
    return area > bestArea ? size : best;
  });

  const sets = getSetsForLayoutAndSize(boardName, effectiveLayoutId, largest.id);
  if (sets.length === 0) return null;

  return {
    boardName,
    layoutId: effectiveLayoutId,
    sizeId: largest.id,
    setIds: sets.map((set) => set.id),
  };
}

function computeMoonBoardConfigForPlaylist(layoutId: number | null | undefined): PlaylistBoardConfig | null {
  // MoonBoard has one fixed size; default to the 2024 layout when the playlist
  // carries no layout id (matches web's fallback).
  const effectiveLayoutId = layoutId ?? MOONBOARD_LAYOUTS['moonboard-2024'].id;

  const layoutEntry = Object.entries(MOONBOARD_LAYOUTS).find(([, layout]) => layout.id === effectiveLayoutId);
  if (!layoutEntry) return null;

  const [layoutKey] = layoutEntry;
  const sets = MOONBOARD_SETS[layoutKey as MoonBoardLayoutKey] ?? [];
  if (sets.length === 0) return null;

  return {
    boardName: 'moonboard',
    layoutId: effectiveLayoutId,
    sizeId: MOONBOARD_SIZE.id,
    setIds: sets.map((set) => set.id),
  };
}
