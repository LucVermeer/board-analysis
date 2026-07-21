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

export type ReactionBoardLayoutInput = {
  windowWidth: number;
  windowHeight: number;
  /** Safe-area insets. */
  insetTop: number;
  insetBottom: number;
  /** Breathing room below the top safe area before the title. */
  contentTopOffset: number;
  /** Gap token stacked between the title, board and card (spacing[5]). */
  sectionGap: number;
  /** Horizontal content padding on ONE side (spacing[6]). */
  sideMargin: number;
  /** Ceiling on the preview/card width (PREVIEW_MAX_WIDTH). */
  previewMaxWidth: number;
  /** Board aspect ratio, width / height. */
  aspect: number;
  /** Reserved heights of the fixed sections the board shares the screen with. */
  primaryRowHeight: number;
  listContentHeight: number;
  textReserve: number;
  /** One action-list row height, used to keep ~2 rows visible under the board. */
  rowHeight: number;
  /** Smallest board the layout aims for before it lets the list scroll instead. */
  boardFloor?: number;
  /** Hard ceiling on the board as a fraction of the window height. */
  heightFraction?: number;
};

// Size the reaction-menu board the way the play drawer sizes its board: contain-fit the
// climb into the space that's left once the title, the quick-action button row and the
// full action list are reserved, so on a smaller screen the climb renders SMALLER rather
// than pushing the actions off the bottom. Bounded three ways — the preview width, a
// window-height fraction, and a ceiling that always keeps the button row + ~2 list rows
// on screen — and floored so the board stays visible until a very small screen genuinely
// has no room (past that the list simply scrolls). Pure so it's unit-tested across the
// install base's screen sizes, mirroring `play-drawer-layout.ts`.
export function computeReactionBoardMaxSize(input: ReactionBoardLayoutInput): number {
  const {
    windowWidth,
    windowHeight,
    insetTop,
    insetBottom,
    contentTopOffset,
    sectionGap,
    sideMargin,
    previewMaxWidth,
    aspect,
    primaryRowHeight,
    listContentHeight,
    textReserve,
    rowHeight,
    boardFloor = 140,
    heightFraction = 0.55,
  } = input;
  const topReserve = insetTop + contentTopOffset;
  const bottomReserve = insetBottom + sectionGap;
  // Space the board fills once the title, buttons and the whole list are reserved. Two
  // section gaps are counted — the board→card gap (explicit) and the bottom padding gap
  // (inside bottomReserve). The smaller title→board gap is deliberately NOT counted here:
  // textReserve reserves more than the title actually needs, and that slack absorbs it.
  const heroHeightBudget =
    windowHeight - topReserve - sectionGap - primaryRowHeight - listContentHeight - bottomReserve - textReserve;
  // The most the board may take while still leaving the button row + ~2 list rows on
  // screen; on a short screen the board yields to this instead of overflowing. This is a
  // deliberately conservative cap (one extra section gap of headroom), so it can bind
  // before heroHeightBudget on mid-range screens without ever letting the board overflow.
  const boardCeiling = Math.max(
    0,
    windowHeight - topReserve - textReserve - primaryRowHeight - 2 * rowHeight - bottomReserve - sectionGap * 2,
  );
  const minSize = Math.min(boardFloor, boardCeiling);
  const maxWidth = Math.min(previewMaxWidth, windowWidth - sideMargin * 2);
  const maxHeight = Math.min(windowHeight * heightFraction, boardCeiling, Math.max(minSize, heroHeightBudget));
  return fitBoardMaxSize(aspect, maxWidth, maxHeight);
}
