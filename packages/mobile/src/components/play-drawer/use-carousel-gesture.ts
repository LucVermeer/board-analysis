import { useEffect, useMemo, useRef } from 'react';
import { Gesture, type GestureType } from 'react-native-gesture-handler';
import { useSharedValue, withTiming, withSpring, runOnJS, type SharedValue } from 'react-native-reanimated';
import { SWIPE_THRESHOLD, EXIT_DURATION, CLIP_EXIT_DURATION } from '@boardsesh/play-view';
import { springs } from '../../theme/animations';
import { hapticMedium } from '../../lib/haptics';

type UseCarouselGestureOptions = {
  onSwipeNext: () => void;
  onSwipePrevious: () => void;
  // Called when the user swipes down meaningfully (drag distance or velocity
  // crosses the dismiss threshold) — used to close the drawer when our
  // gesture is capturing the touch and the sheet's own pan-to-close can't.
  onSwipeDownDismiss?: () => void;
  canSwipeNext: boolean;
  canSwipePrevious: boolean;
  boardWidth: number;
  enabled?: boolean;
  // Optional shared-value gate. Checked on the UI thread so the swipe gesture
  // object stays stable when zoom toggles, avoiding GestureDetector re-registration
  // that can interfere with the just-ended pinch.
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
  onSwipeDownDismiss,
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

  const callbacksRef = useRef({ onSwipeNext, onSwipePrevious, onSwipeDownDismiss });
  callbacksRef.current = { onSwipeNext, onSwipePrevious, onSwipeDownDismiss };

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

  const triggerDismiss = () => {
    callbacksRef.current.onSwipeDownDismiss?.();
  };

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        // Activate on either X (navigation) or Y (dismiss) motion. No failOffsetY
        // — we handle vertical dismiss ourselves in onEnd because the sheet's
        // built-in pan-to-close can't claim the touch while our gesture
        // composition is active.
        .activeOffsetX([-15, 15])
        .activeOffsetY([-15, 15])
        .enabled(enabled)
        .onStart(() => {
          'worklet';
          hasTriggeredHaptic.value = false;
        })
        .onUpdate((event) => {
          'worklet';
          if (isZoomedSV?.value) return;
          if (isAnimating.value) return;

          // Only update carousel translateX for horizontal-dominant drags;
          // vertical drags are handled at end (dismiss vs. spring back).
          const horizontalDominant = Math.abs(event.translationX) > Math.abs(event.translationY);
          if (!horizontalDominant) return;

          let offset = event.translationX;

          if (offset < 0 && !canSwipeNext) offset = 0;
          if (offset > 0 && !canSwipePrevious) offset = 0;

          translateX.value = offset;

          if (Math.abs(offset) >= SWIPE_THRESHOLD && !hasTriggeredHaptic.value) {
            hasTriggeredHaptic.value = true;
            runOnJS(triggerHaptic)();
          }
        })
        .onEnd((event) => {
          'worklet';
          if (isZoomedSV?.value) {
            translateX.value = withSpring(0, springs.interactive);
            return;
          }
          if (isAnimating.value) return;

          const dx = event.translationX;
          const dy = event.translationY;
          const vy = event.velocityY;
          const horizontalDominant = Math.abs(dx) > Math.abs(dy);

          // Dismiss on a clear downward fling or drag — matches sheet UX even
          // though the sheet's own pan can't see this touch.
          if (!horizontalDominant && (dy > 80 || vy > 800)) {
            translateX.value = withSpring(0, springs.interactive);
            runOnJS(triggerDismiss)();
            return;
          }

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
    [enabled, canSwipeNext, canSwipePrevious, boardWidth, translateX, isAnimating, hasTriggeredHaptic, isZoomedSV],
  );

  return { gesture, translateX, isAnimating };
}
