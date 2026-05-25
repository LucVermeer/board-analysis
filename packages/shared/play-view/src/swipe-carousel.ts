/**
 * Platform-agnostic primitives for the swipe-board carousel.
 *
 * Web (`useCardSwipeNavigation`) and mobile (`useCarouselGesture`) implement the
 * gesture/animation plumbing using their native libraries (react-swipeable + CSS
 * transitions, react-native-gesture-handler + reanimated). The decision rules,
 * timings, and peek math live here so both platforms stay in lockstep.
 */

/** Horizontal displacement (px) required for a swipe to commit. */
export const SWIPE_THRESHOLD = 80;

/** Minimum movement (px) before we lock a swipe to horizontal or vertical. */
export const DIRECTION_THRESHOLD = 10;

/** Duration (ms) of the slide-off animation when a swipe commits. */
export const EXIT_DURATION = 300;

/** Duration (ms) of the snap-back when a swipe is below threshold. */
export const SNAP_BACK_DURATION = 200;

/**
 * In delay-navigation mode, the new climb is swapped in this many ms after the
 * slide-off begins. Shorter than EXIT_DURATION so the user sees the next climb
 * promptly while the outgoing card finishes leaving the viewport.
 */
export const CLIP_EXIT_DURATION = 100;

/** Duration (ms) of the enter-direction crossfade after navigation commits. */
export const ENTER_ANIMATION_DURATION = 170;

export type SwipeDirection = 'left' | 'right';
export type AnimationDirection = SwipeDirection | null;
export type EnterDirection = 'from-left' | 'from-right';
export type SwipeOutcome = 'next' | 'previous' | 'cancel';
export type PeekDirection = 'next' | 'prev';

/**
 * Bounded peek translateX. Matches the web `calc(max(0, 100% + offset))` /
 * `calc(min(0, -100% + offset))` formulas, expressed in pixels so reanimated
 * worklets can consume it directly.
 */
export function computePeekOffset({
  direction,
  swipeOffset,
  viewportWidth,
}: {
  direction: PeekDirection;
  swipeOffset: number;
  viewportWidth: number;
}): number {
  if (direction === 'next') {
    return Math.max(0, viewportWidth + swipeOffset);
  }
  return Math.min(0, -viewportWidth + swipeOffset);
}

/**
 * First-movement direction lock. Returns 'horizontal' once |dx| > |dy| past the
 * threshold, 'vertical' the other way, or null while still under the threshold.
 * Callers are expected to keep the decision sticky until a reset.
 */
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

/**
 * Given a finished swipe, decide whether to navigate next, previous, or cancel.
 * `deltaX < 0` (finger moved left) maps to `next`; the opposite to `previous`.
 */
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

/**
 * Choose which sibling climb to render in the peek slot. During the active
 * gesture the direction comes from the sign of the live offset; once the swipe
 * has committed we lock to `animationDirection` (which won't flip mid-exit).
 */
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

/** Map a committed navigation to the matching enter-crossfade direction. */
export function getEnterDirection(navigation: 'next' | 'previous'): EnterDirection {
  return navigation === 'next' ? 'from-right' : 'from-left';
}
