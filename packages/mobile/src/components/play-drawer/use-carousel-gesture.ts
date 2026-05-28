import { useEffect, useMemo, useRef } from 'react';
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
  isZoomedSV?: SharedValue<boolean>;
};

type UseCarouselGestureReturn = {
  gesture: GestureType;
  translateX: SharedValue<number>;
  isAnimating: SharedValue<boolean>;
};

// Delay-navigation: matches web — swap climb at CLIP_EXIT_DURATION while the
// outgoing card finishes its EXIT_DURATION slide-off behind the peek board.
export function useCarouselGesture({
  onSwipeNext,
  onSwipePrevious,
  canSwipeNext,
  canSwipePrevious,
  boardWidth,
  enabled = true,
  isZoomedSV,
}: UseCarouselGestureOptions): UseCarouselGestureReturn {
  const translateX = useSharedValue(0);
  const isAnimating = useSharedValue(false);
  const hasTriggeredHaptic = useSharedValue(false);
  const commitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mirror enabled into a shared value so the gesture useMemo doesn't rebuild
  // when it flips — recomposing mid-session left RNGH stuck on iOS.
  const enabledSV = useSharedValue(enabled);
  useEffect(() => {
    enabledSV.value = enabled;
  }, [enabled, enabledSV]);

  const callbacksRef = useRef({ onSwipeNext, onSwipePrevious });
  callbacksRef.current = { onSwipeNext, onSwipePrevious };

  useEffect(
    () => () => {
      if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
    },
    [],
  );

  const triggerHaptic = () => {
    hapticMedium();
  };

  const scheduleCommit = (direction: 'next' | 'previous') => {
    if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
    commitTimerRef.current = setTimeout(() => {
      commitTimerRef.current = null;
      // Hard-set cancels the in-flight withTiming on the UI thread.
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
        // Horizontal-only: activate on X motion, fail on Y. Vertical drags
        // fall through to the BottomSheetScrollView so the user can scroll
        // the drawer (and reach the sheet handle to dismiss). Cost: no
        // swipe-to-dismiss directly on the climb image.
        .activeOffsetX([-15, 15])
        .failOffsetY([-10, 10])
        .onStart(() => {
          'worklet';
          hasTriggeredHaptic.value = false;
        })
        .onUpdate((event) => {
          'worklet';
          if (!enabledSV.value) return;
          if (isZoomedSV?.value) return;
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
          if (!enabledSV.value) return;
          if (isZoomedSV?.value) {
            translateX.value = withSpring(0, springs.interactive);
            return;
          }
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
    [canSwipeNext, canSwipePrevious, boardWidth, translateX, isAnimating, hasTriggeredHaptic, isZoomedSV, enabledSV],
  );

  return { gesture, translateX, isAnimating };
}
