// Pure aspect-ratio math for the reaction-menu board preview. Extracted from
// ClimbReactionMenu so it unit-tests without pulling in React Native / Reanimated.

export type FittedSize = { width: number; height: number };

// Fit a board of the given native dimensions into a square of side `maxSize`,
// preserving aspect. `maxSize` is the larger rendered edge (width for landscape,
// height for portrait). Degenerate dims fall back to a square.
export function fitBoardArt(boardWidth: number, boardHeight: number, maxSize: number): FittedSize {
  const aspect = boardWidth / boardHeight;
  if (!Number.isFinite(aspect) || aspect <= 0) return { width: maxSize, height: maxSize };
  return aspect >= 1 ? { width: maxSize, height: maxSize / aspect } : { width: maxSize * aspect, height: maxSize };
}

// The `maxSize` to feed `fitBoardArt` so the render fills a (maxWidth × maxHeight)
// box rather than a square — lets a portrait board grow tall instead of being pinned
// by screen width. Landscape is bounded by width (and the derived height), portrait by
// height (and the derived width).
export function fitBoardMaxSize(aspect: number, maxWidth: number, maxHeight: number): number {
  if (!Number.isFinite(aspect) || aspect <= 0) return Math.min(maxWidth, maxHeight);
  return aspect >= 1 ? Math.min(maxWidth, maxHeight * aspect) : Math.min(maxHeight, maxWidth / aspect);
}
