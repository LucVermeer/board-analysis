import { useMemo, useRef } from 'react';
import { Gesture, type GestureType } from 'react-native-gesture-handler';
import { useSharedValue, withTiming, withSpring, runOnJS, type SharedValue } from 'react-native-reanimated';
import { springs } from '../../theme/animations';
import { hapticMedium } from '../../lib/haptics';

const SWIPE_THRESHOLD = 80;
const EXIT_DURATION = 300;

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

  const callbacksRef = useRef({ onSwipeNext, onSwipePrevious });
  callbacksRef.current = { onSwipeNext, onSwipePrevious };

  const triggerHaptic = () => {
    hapticMedium();
  };

  const handleSwipeNext = () => {
    callbacksRef.current.onSwipeNext();
  };

  const handleSwipePrevious = () => {
    callbacksRef.current.onSwipePrevious();
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
            translateX.value = withTiming(-boardWidth, { duration: EXIT_DURATION }, () => {
              'worklet';
              translateX.value = 0;
              isAnimating.value = false;
              runOnJS(handleSwipeNext)();
            });
          } else if (offset > SWIPE_THRESHOLD && canSwipePrevious) {
            isAnimating.value = true;
            translateX.value = withTiming(boardWidth, { duration: EXIT_DURATION }, () => {
              'worklet';
              translateX.value = 0;
              isAnimating.value = false;
              runOnJS(handleSwipePrevious)();
            });
          } else {
            translateX.value = withSpring(0, springs.interactive);
          }
        }),
    [enabled, canSwipeNext, canSwipePrevious, boardWidth, translateX, isAnimating, hasTriggeredHaptic],
  );

  return { gesture, translateX, isAnimating };
}
