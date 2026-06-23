// Web (useCardSwipeNavigation) and mobile (useCarouselGesture) own the gesture
// plumbing; timings + decision rules live here so both stay in lockstep.

export const SWIPE_THRESHOLD = 80;
export const DIRECTION_THRESHOLD = 10;
export const EXIT_DURATION = 300;
export const SNAP_BACK_DURATION = 200;
// New climb swaps in this many ms after the slide-off begins.
export const CLIP_EXIT_DURATION = 100;
export const ENTER_ANIMATION_DURATION = 170;

// Zoom constants shared between web (useZoomPan) and mobile (useZoomPanGesture).
export const MIN_SCALE = 1;
export const MAX_SCALE = 4;
export const ZOOM_THRESHOLD = 1.02;

// Pinch-zoom focal-point math: keep the point under the focal stationary
// across a scale change. The savedTranslate term must be multiplied by
// scaleDelta — pinching from an already-zoomed state with the wrong formula
// drifts the focal point off the user's fingers. Mobile inlines this formula
// inside a reanimated worklet (cross-module worklet calls aren't reliable);
// the shared definition exists as the canonical spec and for unit tests.
export function computeFocalPinchTranslation({
  focalOffset,
  scaleDelta,
  savedTranslate,
}: {
  focalOffset: number;
  scaleDelta: number;
  savedTranslate: number;
}): number {
  return focalOffset * (1 - scaleDelta) + scaleDelta * savedTranslate;
}

// Clamp translation so zoomed content stays within the visible container —
// at scale s the content overflows by (container * (s - 1)) / 2 on each
// side, so the translation can move up to that much before exposing empty
// space. Same inline / shared split as computeFocalPinchTranslation.
export function clampTranslation(
  translationX: number,
  translationY: number,
  currentScale: number,
  containerWidth: number,
  containerHeight: number,
): { x: number; y: number } {
  if (currentScale <= 1) return { x: 0, y: 0 };

  const maxX = (containerWidth * (currentScale - 1)) / 2;
  const maxY = (containerHeight * (currentScale - 1)) / 2;

  return {
    x: Math.max(-maxX, Math.min(maxX, translationX)),
    y: Math.max(-maxY, Math.min(maxY, translationY)),
  };
}

export type SwipeDirection = 'left' | 'right';
export type AnimationDirection = SwipeDirection | null;
export type EnterDirection = 'from-left' | 'from-right';
export type SwipeOutcome = 'next' | 'previous' | 'cancel';
export type PeekDirection = 'next' | 'prev';

// 'worklet' so this is callable from reanimated UI-thread closures on mobile.
// In non-worklet contexts (web, tests) the directive is a harmless no-op.
export function computePeekOffset({
  direction,
  swipeOffset,
  viewportWidth,
}: {
  direction: PeekDirection;
  swipeOffset: number;
  viewportWidth: number;
}): number {
  'worklet';
  if (direction === 'next') {
    return Math.max(0, viewportWidth + swipeOffset);
  }
  return Math.min(0, -viewportWidth + swipeOffset);
}

export function decideSwipeDirection(
  deltaX: number,
  deltaY: number,
  threshold: number = DIRECTION_THRESHOLD,
): 'horizontal' | 'vertical' | null {
  const absX = Math.abs(deltaX);
  const absY = Math.abs(deltaY);
  if (absX <= threshold && absY <= threshold) return null;
  return absX > absY ? 'horizontal' : 'vertical';
}

export function evaluateSwipeOutcome({
  deltaX,
  threshold,
  canNext,
  canPrev,
}: {
  deltaX: number;
  threshold?: number;
  canNext: boolean;
  canPrev: boolean;
}): SwipeOutcome {
  const t = threshold ?? SWIPE_THRESHOLD;
  if (deltaX <= -t && canNext) return 'next';
  if (deltaX >= t && canPrev) return 'previous';
  return 'cancel';
}

export function selectPeekDirection({
  animationDirection,
  swipeOffset,
}: {
  animationDirection: AnimationDirection;
  swipeOffset: number;
}): PeekDirection {
  if (animationDirection === 'left') return 'next';
  if (animationDirection === 'right') return 'prev';
  return swipeOffset < 0 ? 'next' : 'prev';
}

export function getEnterDirection(navigation: 'next' | 'previous'): EnterDirection {
  return navigation === 'next' ? 'from-right' : 'from-left';
}

// ── Mobile card-throw (Tinder-style) swipe animation ────────────────────────
// Mobile-only tuning + pure helpers for the play-drawer's swipe-between-climbs
// feel: the OUTGOING (current) board tilts as you drag and flings off-screen with
// rotation on release. The INCOMING (next) board slides in edge-adjacent via the
// shared computePeekOffset, so it enters from the swipe direction. Web's swipe
// stays a flat slide and does not import any of these.
//
// As with computePeekOffset, the helpers are 'worklet'-marked so the mobile
// useAnimatedStyle closures can call them on the UI thread; in non-worklet
// contexts (tests) the directive is a harmless no-op. Mobile GESTURE callbacks
// (Gesture.Pan().onEnd) must still inline constants rather than call these —
// cross-module worklet CALLS aren't reliable there — so the constants are
// exported for that inlining and the functions exist as the tested spec.

/** Tilt (deg) the card saturates to around the swipe threshold while dragging. */
export const CARD_THROW_MAX_ROTATION_DEG = 12;
/** Degrees of tilt per px of horizontal drag, before clamping. */
export const CARD_THROW_ROTATION_PER_PX = 0.06;
/** Max downward droop (px) the outgoing card dips as it flies off. */
export const CARD_THROW_DROOP = 40;
/** Extra px past the screen edge the fling targets so the tilted card clears. */
export const CARD_THROW_OFFSCREEN_PAD = 80;

function clamp01(value: number): number {
  'worklet';
  return Math.max(0, Math.min(1, value));
}

// Tilt as a function of horizontal drag. Linear (clamped to ±MAX) while the card
// is still on/near screen; past the board edge it whips further so the fling
// reads as a throw. Sign-symmetric. boardWidth <= 0 (pre-layout) → no extra spin.
export function computeCardRotation(swipeOffset: number, boardWidth: number): number {
  'worklet';
  const base = Math.max(
    -CARD_THROW_MAX_ROTATION_DEG,
    Math.min(CARD_THROW_MAX_ROTATION_DEG, swipeOffset * CARD_THROW_ROTATION_PER_PX),
  );
  if (boardWidth <= 0 || Math.abs(swipeOffset) <= boardWidth) return base;
  const overshoot = Math.abs(swipeOffset) - boardWidth;
  const extra = Math.sign(swipeOffset) * overshoot * CARD_THROW_ROTATION_PER_PX;
  return base + extra;
}

// Downward droop of the outgoing card: 0 while it's still within the board box,
// growing to CARD_THROW_DROOP a board-width past the edge. boardWidth <= 0 → 0.
export function computeThrowDroop(swipeOffset: number, boardWidth: number): number {
  'worklet';
  if (boardWidth <= 0) return 0;
  const over = Math.max(0, Math.abs(swipeOffset) - boardWidth);
  return clamp01(over / boardWidth) * CARD_THROW_DROOP;
}

// Where the fling animates translateX to so the card fully clears the screen,
// margins and tilt included.
export function computeThrowExitTarget(screenWidth: number): number {
  'worklet';
  return screenWidth + CARD_THROW_OFFSCREEN_PAD;
}
