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
