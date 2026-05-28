import { useEffect, useMemo, useRef } from 'react';
import { Gesture, type GestureType } from 'react-native-gesture-handler';
import { useSharedValue, withTiming, withSpring, runOnJS, type SharedValue } from 'react-native-reanimated';
import { SWIPE_THRESHOLD, DIRECTION_THRESHOLD, EXIT_DURATION, CLIP_EXIT_DURATION } from '@boardsesh/play-view';
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

  // Lock direction on first significant move — matches the web pattern in
  // useCardSwipeNavigation. Once locked horizontal, the gesture stays
  // committed even if the user drifts vertically. failOffsetY would
  // otherwise kill a horizontal swipe the moment Y drift crossed 10px,
  // making carousel swipes finicky. Vertical-locked gestures fail so the
  // touch falls through to BottomSheetScrollView.
  const directionLock = useSharedValue<0 | 1 | -1>(0); // 0=undecided, 1=horizontal, -1=vertical
  const startTouchX = useSharedValue(0);
  const startTouchY = useSharedValue(0);

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .manualActivation(true)
        .onTouchesDown((event) => {
          'worklet';
          directionLock.value = 0;
          const touch = event.allTouches[0];
          if (touch) {
            startTouchX.value = touch.absoluteX;
            startTouchY.value = touch.absoluteY;
          }
        })
        .onTouchesMove((event, state) => {
          'worklet';
          if (!enabledSV.value || isZoomedSV?.value) {
            state.fail();
            return;
          }
          if (directionLock.value === 1) {
            state.activate();
            return;
          }
          if (directionLock.value === -1) {
            state.fail();
            return;
          }
          const touch = event.allTouches[0];
          if (!touch) return;
          const dx = touch.absoluteX - startTouchX.value;
          const dy = touch.absoluteY - startTouchY.value;
          const absX = Math.abs(dx);
          const absY = Math.abs(dy);
          if (absX <= DIRECTION_THRESHOLD && absY <= DIRECTION_THRESHOLD) return;
          if (absX > absY) {
            directionLock.value = 1;
            state.activate();
          } else {
            directionLock.value = -1;
            state.fail();
          }
        })
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
    [
      canSwipeNext,
      canSwipePrevious,
      boardWidth,
      translateX,
      isAnimating,
      hasTriggeredHaptic,
      isZoomedSV,
      enabledSV,
      directionLock,
      startTouchX,
      startTouchY,
    ],
  );

  return { gesture, translateX, isAnimating };
}
