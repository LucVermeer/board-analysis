import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Gesture, type GestureType } from 'react-native-gesture-handler';
import {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  cancelAnimation,
  runOnJS,
  type SharedValue,
  type AnimatedStyle,
} from 'react-native-reanimated';
import { MIN_SCALE, MAX_SCALE, ZOOM_THRESHOLD } from '@boardsesh/play-view';
import { timing } from '../../theme/animations';

type UseZoomPanGestureOptions = {
  enabled?: boolean;
  containerWidth: number;
  containerHeight: number;
};

type UseZoomPanGestureReturn = {
  pinchGesture: GestureType;
  zoomPanGesture: GestureType;
  isZoomed: boolean;
  isZoomedSV: SharedValue<boolean>;
  resetZoom: () => void;
  animatedZoomStyle: AnimatedStyle;
  scale: SharedValue<number>;
};

export function clampTranslation(
  translationX: number,
  translationY: number,
  currentScale: number,
  containerWidth: number,
  containerHeight: number,
): { x: number; y: number } {
  'worklet';
  if (currentScale <= 1) return { x: 0, y: 0 };

  const maxX = (containerWidth * (currentScale - 1)) / 2;
  const maxY = (containerHeight * (currentScale - 1)) / 2;

  return {
    x: Math.max(-maxX, Math.min(maxX, translationX)),
    y: Math.max(-maxY, Math.min(maxY, translationY)),
  };
}

export function useZoomPanGesture({
  enabled = true,
  containerWidth,
  containerHeight,
}: UseZoomPanGestureOptions): UseZoomPanGestureReturn {
  const scale = useSharedValue(MIN_SCALE);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  const savedScale = useSharedValue(MIN_SCALE);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const pinchFocalX = useSharedValue(0);
  const pinchFocalY = useSharedValue(0);

  // Peak scale reached during the current pinch. Used to decide whether the
  // user really meant to zoom — event.scale can momentarily drop on finger-lift
  // and clamp scale.value back to MIN_SCALE, which would otherwise cause the
  // threshold check in onEnd to trigger a reset right after a real zoom.
  const pinchPeakScale = useSharedValue(MIN_SCALE);

  // Shared value mirrors JS isZoomed so gesture worklets can read it without
  // triggering gesture object recreation on zoom state transitions.
  const isZoomedSV = useSharedValue(false);

  const [isZoomed, setIsZoomed] = useState(false);
  const isZoomedRef = useRef(false);

  const updateZoomState = useCallback((zoomed: boolean) => {
    isZoomedRef.current = zoomed;
    // isZoomedSV is also written from the pinch worklet for synchronous UI-thread
    // visibility (so the swipe gesture's onEnd reads the new value in the same
    // frame). Setting it here too keeps JS-initiated resets in sync.
    isZoomedSV.value = zoomed;
    setIsZoomed(zoomed);
  }, [isZoomedSV]);

  const resetZoom = useCallback(() => {
    // Cancel any in-flight animations before snapping saved values so a
    // pinch starting mid-animation reads consistent state.
    cancelAnimation(scale);
    cancelAnimation(translateX);
    cancelAnimation(translateY);

    scale.value = withTiming(MIN_SCALE, { duration: timing.normal });
    translateX.value = withTiming(0, { duration: timing.normal });
    translateY.value = withTiming(0, { duration: timing.normal });
    savedScale.value = MIN_SCALE;
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
    updateZoomState(false);
  }, [scale, translateX, translateY, savedScale, savedTranslateX, savedTranslateY, updateZoomState]);

  useEffect(() => {
    if (!enabled && isZoomedRef.current) {
      resetZoom();
    }
  }, [enabled, resetZoom]);

  const pinchGesture = useMemo(
    () =>
      Gesture.Pinch()
        .enabled(enabled)
        .onStart((event) => {
          'worklet';
          // Snapshot current animated values so a pinch that starts during a
          // reset animation picks up where the animation currently is, not
          // where it was going. This prevents the visual jump described in #2.
          savedScale.value = scale.value;
          savedTranslateX.value = translateX.value;
          savedTranslateY.value = translateY.value;
          pinchPeakScale.value = scale.value;

          pinchFocalX.value = event.focalX;
          pinchFocalY.value = event.focalY;
        })
        .onUpdate((event) => {
          'worklet';
          const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, savedScale.value * event.scale));

          const focalOffsetX = pinchFocalX.value - containerWidth / 2;
          const focalOffsetY = pinchFocalY.value - containerHeight / 2;
          const scaleDelta = newScale / savedScale.value;
          // Keep the point under the focal stationary across the zoom:
          //   tx = focalOffset * (1 - scaleDelta) + scaleDelta * tx0
          // The savedTranslate factor is `scaleDelta`, not 1 — when zooming
          // from an already-zoomed state, the existing translation must scale
          // along with the rest of the content.
          const newTranslateX = focalOffsetX * (1 - scaleDelta) + scaleDelta * savedTranslateX.value;
          const newTranslateY = focalOffsetY * (1 - scaleDelta) + scaleDelta * savedTranslateY.value;

          const clamped = clampTranslation(newTranslateX, newTranslateY, newScale, containerWidth, containerHeight);
          scale.value = newScale;
          translateX.value = clamped.x;
          translateY.value = clamped.y;
          if (newScale > pinchPeakScale.value) {
            pinchPeakScale.value = newScale;
          }
        })
        .onEnd(() => {
          'worklet';
          // Use peak scale: event.scale can momentarily dip on finger-lift and
          // clamp scale.value back to MIN_SCALE, which would otherwise reset a
          // real zoom. Always preserve whatever the peak was (or current value
          // if the user pinched-out further than peak, which is impossible but
          // defensive).
          const finalScale = Math.max(scale.value, pinchPeakScale.value);
          scale.value = finalScale;
          savedScale.value = finalScale;
          savedTranslateX.value = translateX.value;
          savedTranslateY.value = translateY.value;
          const nowZoomed = finalScale > ZOOM_THRESHOLD;
          // Set the shared value synchronously on the UI thread so that
          // sibling gestures (notably the swipe gesture's onEnd, which fires
          // in the same frame) see the zoomed state immediately and skip
          // navigation. runOnJS only propagates after the next JS tick.
          isZoomedSV.value = nowZoomed;
          runOnJS(updateZoomState)(nowZoomed);
        }),
    [
      enabled,
      containerWidth,
      containerHeight,
      scale,
      translateX,
      translateY,
      savedScale,
      savedTranslateX,
      savedTranslateY,
      pinchFocalX,
      pinchFocalY,
      pinchPeakScale,
      isZoomedSV,
      updateZoomState,
    ],
  );

  // The zoom pan gesture checks isZoomedSV on the UI thread instead of using
  // the JS `isZoomed` state in the enabled() config. This keeps the gesture
  // object stable across zoom transitions, avoiding RNGH handler re-registration.
  const zoomPanGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(enabled)
        .minPointers(1)
        .maxPointers(1)
        .onStart(() => {
          'worklet';
          // Snapshot current values so panning during a reset animation
          // starts from the actual position.
          savedTranslateX.value = translateX.value;
          savedTranslateY.value = translateY.value;
        })
        .onUpdate((event) => {
          'worklet';
          if (!isZoomedSV.value || scale.value <= MIN_SCALE) return;

          const newX = savedTranslateX.value + event.translationX;
          const newY = savedTranslateY.value + event.translationY;
          const clamped = clampTranslation(newX, newY, scale.value, containerWidth, containerHeight);
          translateX.value = clamped.x;
          translateY.value = clamped.y;
        })
        .onEnd(() => {
          'worklet';
          savedTranslateX.value = translateX.value;
          savedTranslateY.value = translateY.value;
        }),
    [enabled, containerWidth, containerHeight, scale, translateX, translateY, savedTranslateX, savedTranslateY, isZoomedSV],
  );

  const animatedZoomStyle = useAnimatedStyle(() => ({
    // Order matters: translate then scale. RN composes matrix left-to-right
    // (M1 * M2 * ... * v), so the last op is applied to the point first.
    // [translate, scale] = T*S applied to point: S first scales the point,
    // then T adds translation in screen-pixel units. The reverse order
    // [scale, translate] would put translation in pre-scale units, making
    // it visually multiplied by scale (pan would feel "too fast" at high zoom).
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }, { scale: scale.value }],
  }));

  return {
    pinchGesture,
    zoomPanGesture,
    isZoomed,
    isZoomedSV,
    resetZoom,
    animatedZoomStyle,
    scale,
  };
}
