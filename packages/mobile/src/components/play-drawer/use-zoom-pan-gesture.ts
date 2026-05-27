import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Gesture, type GestureType } from 'react-native-gesture-handler';
import {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
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
  resetZoom: () => void;
  animatedZoomStyle: AnimatedStyle;
  scale: SharedValue<number>;
};

function clampTranslation(
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

  const [isZoomed, setIsZoomed] = useState(false);
  const isZoomedRef = useRef(false);

  const updateZoomState = useCallback((zoomed: boolean) => {
    isZoomedRef.current = zoomed;
    setIsZoomed(zoomed);
  }, []);

  const resetZoom = useCallback(() => {
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
          pinchFocalX.value = event.focalX;
          pinchFocalY.value = event.focalY;
        })
        .onUpdate((event) => {
          'worklet';
          const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, savedScale.value * event.scale));

          // Adjust translation to keep pinch focal point stable
          const focalOffsetX = pinchFocalX.value - containerWidth / 2;
          const focalOffsetY = pinchFocalY.value - containerHeight / 2;
          const scaleDelta = newScale / savedScale.value;
          const newTranslateX = savedTranslateX.value + focalOffsetX * (1 - scaleDelta);
          const newTranslateY = savedTranslateY.value + focalOffsetY * (1 - scaleDelta);

          const clamped = clampTranslation(newTranslateX, newTranslateY, newScale, containerWidth, containerHeight);
          scale.value = newScale;
          translateX.value = clamped.x;
          translateY.value = clamped.y;
        })
        .onEnd(() => {
          'worklet';
          if (scale.value < ZOOM_THRESHOLD) {
            scale.value = withTiming(MIN_SCALE, { duration: timing.fast });
            translateX.value = withTiming(0, { duration: timing.fast });
            translateY.value = withTiming(0, { duration: timing.fast });
            savedScale.value = MIN_SCALE;
            savedTranslateX.value = 0;
            savedTranslateY.value = 0;
            runOnJS(updateZoomState)(false);
          } else {
            savedScale.value = scale.value;
            savedTranslateX.value = translateX.value;
            savedTranslateY.value = translateY.value;
            runOnJS(updateZoomState)(true);
          }
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
      updateZoomState,
    ],
  );

  const zoomPanGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(enabled && isZoomed)
        .minPointers(1)
        .maxPointers(1)
        .onUpdate((event) => {
          'worklet';
          if (scale.value <= MIN_SCALE) return;

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
    [enabled, isZoomed, containerWidth, containerHeight, scale, translateX, translateY, savedTranslateX, savedTranslateY],
  );

  const animatedZoomStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { translateX: translateX.value }, { translateY: translateY.value }],
  }));

  return {
    pinchGesture,
    zoomPanGesture,
    isZoomed,
    resetZoom,
    animatedZoomStyle,
    scale,
  };
}
