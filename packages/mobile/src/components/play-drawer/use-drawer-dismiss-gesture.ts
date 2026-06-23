import { useMemo, useRef } from 'react';
import { Gesture, type GestureType } from 'react-native-gesture-handler';
import { useSharedValue, withSpring, runOnJS, type SharedValue } from 'react-native-reanimated';
import { springs } from '../../theme/animations';

// Pull-down-to-dismiss for the full-screen player route. The route is a native
// `transparentModal`; its built-in interactive dismiss lives OUTSIDE RNGH, so it
// could never negotiate with the board's swipe/pinch or the scroll — it only
// fired in the bare grabber region ("only works using the drag handle"). This
// RNGH Pan lives in the same gesture tree as the scroll + board, so it can yield
// to them and drive a dismiss from the WHOLE surface. The route sets
// `gestureEnabled: false`; dismissal is `router.dismiss()` past the threshold.

/** Downward travel (px) before the dismiss takes over from the scroll. */
const DISMISS_ACTIVATE_OFFSET = 12;
/** Drag distance (px) that commits a dismiss on release. */
const DISMISS_DISTANCE_THRESHOLD = 120;
/** Downward fling velocity (px/s) that commits a dismiss even on a short drag. */
const DISMISS_VELOCITY_THRESHOLD = 800;

type UseDrawerDismissGestureOptions = {
  /** Dismiss the route (e.g. `router.dismiss`). */
  onDismiss: () => void;
  /** Live scroll offset of the drawer's ScrollView. The dismiss only engages at
   *  the very top (<= 0); anywhere else a downward drag is a scroll. */
  scrollYSV: SharedValue<number>;
};

type UseDrawerDismissGestureReturn = {
  gesture: GestureType;
  /** Drawer translateY to apply for the rubber-band drag. */
  translateY: SharedValue<number>;
};

export function useDrawerDismissGesture({
  onDismiss,
  scrollYSV,
}: UseDrawerDismissGestureOptions): UseDrawerDismissGestureReturn {
  const translateY = useSharedValue(0);
  const isDismissing = useSharedValue(false);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  // 0 = undecided, 1 = dismissing (vertical-down at top), -1 = failed (yield to
  // the scroll / carousel for this touch).
  const directionLock = useSharedValue<0 | 1 | -1>(0);

  // Captured ONCE by the gesture memo — must only close over the ref so a later
  // render's onDismiss is still reached (mirrors use-carousel-gesture).
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  const commitDismiss = () => {
    onDismissRef.current();
  };

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        // A 2-finger pinch must never read as a dismiss — fail the moment a
        // second finger lands so zoom stays with the board's pinch gesture.
        .maxPointers(1)
        .manualActivation(true)
        .onTouchesDown((event) => {
          'worklet';
          directionLock.value = 0;
          const touch = event.allTouches[0];
          if (touch) {
            startX.value = touch.absoluteX;
            startY.value = touch.absoluteY;
          }
        })
        .onTouchesMove((event, state) => {
          'worklet';
          if (isDismissing.value) return;
          if (directionLock.value === 1) {
            state.activate();
            return;
          }
          if (directionLock.value === -1) {
            state.fail();
            return;
          }
          // Only at the very top of the scroll — otherwise the drag scrolls.
          if (scrollYSV.value > 0) {
            directionLock.value = -1;
            state.fail();
            return;
          }
          const touch = event.allTouches[0];
          if (!touch) return;
          const dx = touch.absoluteX - startX.value;
          const dy = touch.absoluteY - startY.value;
          // Horizontal-dominant → the carousel owns it.
          if (Math.abs(dx) > Math.abs(dy)) {
            directionLock.value = -1;
            state.fail();
            return;
          }
          // Upward → a scroll into the below-fold content.
          if (dy < 0) {
            directionLock.value = -1;
            state.fail();
            return;
          }
          if (dy > DISMISS_ACTIVATE_OFFSET) {
            directionLock.value = 1;
            state.activate();
          }
        })
        .onUpdate((event) => {
          'worklet';
          // Follow the finger downward only; an upward drag can't lift the drawer.
          translateY.value = Math.max(0, event.translationY);
        })
        .onEnd((event) => {
          'worklet';
          if (translateY.value > DISMISS_DISTANCE_THRESHOLD || event.velocityY > DISMISS_VELOCITY_THRESHOLD) {
            // Hand off to the native route's slide-out; leave translateY where it
            // is so the dismiss continues from the dragged position.
            isDismissing.value = true;
            runOnJS(commitDismiss)();
          } else {
            translateY.value = withSpring(0, springs.interactive);
          }
        }),
    [translateY, isDismissing, startX, startY, directionLock, scrollYSV],
  );

  return { gesture, translateY };
}
