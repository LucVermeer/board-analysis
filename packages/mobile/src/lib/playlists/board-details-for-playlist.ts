import type { BoardName } from '@boardsesh/shared-schema';
import { getSizesForLayoutId, getSetsForLayoutAndSize, getAllLayouts } from '@boardsesh/board-constants/product-sizes';

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

/**
 * Resolve a renderable board config (largest size + all its sets) for a
 * playlist that only carries `boardType` + `layoutId`. Mobile mirror of web's
 * `getBoardDetailsForPlaylist`, returning the minimal config the bundled
 * background cache needs. Returns null when the board/layout can't resolve
 * (e.g. moonboard, which the bundled-asset path doesn't cover) so the caller
 * falls back cleanly to the plain colour tile.
 */
export function getBoardConfigForPlaylist(
  boardType: string,
  layoutId: number | null | undefined,
): PlaylistBoardConfig | null {
  // `boardType` is a free-form string off the playlist record. Force it to
  // BoardName (project convention: `as unknown as` for unsafe casts) and lean on
  // the board-constants lookups below returning empty for anything unknown — we
  // return null (→ plain colour tile) rather than rendering a bad board, so the
  // cast is safe at runtime.
  const boardName = boardType as unknown as BoardName;
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
