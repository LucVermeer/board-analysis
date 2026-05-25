import { useMemo, useRef } from 'react';
import { Gesture, type GestureType } from 'react-native-gesture-handler';
import { useSharedValue, withTiming, withSpring, runOnJS, type SharedValue } from 'react-native-reanimated';
import { SWIPE_THRESHOLD, EXIT_DURATION, CLIP_EXIT_DURATION } from '@boardsesh/play-view';
import { springs } from '../../theme/animations';
import { hapticMedium } from '../../lib/haptics';

type UseCarouselGestureOptions = {
  onSwipeNext: () => void;
  onSwipePrevious: () => void;
  canSwipeNext: boolean;
  canSwipePrevious: boolean;
  boardWidth: number;
  enabled?: boolean;
};

type UseCarouselGestureReturn = {
  gesture: GestureType;
  translateX: SharedValue<number>;
  isAnimating: SharedValue<boolean>;
};

/**
 * Pan gesture for the board carousel. Matches the web `useCardSwipeNavigation`
 * delay-navigation flow: the slide-off animation runs for EXIT_DURATION, but the
 * climb swap fires at CLIP_EXIT_DURATION so the new board appears promptly while
 * the outgoing peek board provides visual continuity.
 *
 * Snap-back below threshold uses `springs.interactive` rather than a fixed
 * SNAP_BACK_DURATION timing — a spring feels more natural on native, and the
 * user-visible duration is comparable.
 */
export function useCarouselGesture({
  onSwipeNext,
  onSwipePrevious,
  canSwipeNext,
  canSwipePrevious,
  boardWidth,
  enabled = true,
}: UseCarouselGestureOptions): UseCarouselGestureReturn {
  const translateX = useSharedValue(0);
  const isAnimating = useSharedValue(false);
  const hasTriggeredHaptic = useSharedValue(false);
  const commitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const callbacksRef = useRef({ onSwipeNext, onSwipePrevious });
  callbacksRef.current = { onSwipeNext, onSwipePrevious };

  const triggerHaptic = () => {
    hapticMedium();
  };

  const scheduleCommit = (direction: 'next' | 'previous') => {
    if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
    commitTimerRef.current = setTimeout(() => {
      commitTimerRef.current = null;
      // Jump-cut the carousel back to center so the freshly swapped climb
      // renders in place. Assigning translateX.value cancels the in-flight
      // withTiming on the UI thread.
      translateX.value = 0;
      isAnimating.value = false;
      if (direction === 'next') {
        callbacksRef.current.onSwipeNext();
      } else {
        callbacksRef.current.onSwipePrevious();
      }
    }, CLIP_EXIT_DURATION);
  };

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-15, 15])
        .failOffsetY([-10, 10])
        .enabled(enabled)
        .onStart(() => {
          'worklet';
          hasTriggeredHaptic.value = false;
        })
        .onUpdate((event) => {
          'worklet';
          if (isAnimating.value) return;

          let offset = event.translationX;

          if (offset < 0 && !canSwipeNext) offset = 0;
          if (offset > 0 && !canSwipePrevious) offset = 0;

          translateX.value = offset;

          if (Math.abs(offset) >= SWIPE_THRESHOLD && !hasTriggeredHaptic.value) {
            hasTriggeredHaptic.value = true;
            runOnJS(triggerHaptic)();
          }
        })
        .onEnd(() => {
          'worklet';
          if (isAnimating.value) return;

          const offset = translateX.value;

          if (offset < -SWIPE_THRESHOLD && canSwipeNext) {
            isAnimating.value = true;
            translateX.value = withTiming(-boardWidth, { duration: EXIT_DURATION });
            runOnJS(scheduleCommit)('next');
          } else if (offset > SWIPE_THRESHOLD && canSwipePrevious) {
            isAnimating.value = true;
            translateX.value = withTiming(boardWidth, { duration: EXIT_DURATION });
            runOnJS(scheduleCommit)('previous');
          } else {
            translateX.value = withSpring(0, springs.interactive);
          }
        }),
    [enabled, canSwipeNext, canSwipePrevious, boardWidth, translateX, isAnimating, hasTriggeredHaptic],
  );

  return { gesture, translateX, isAnimating };
}
