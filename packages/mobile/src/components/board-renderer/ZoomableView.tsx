import React, { type ReactNode } from 'react';
import { StyleSheet, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withDecay, withTiming } from 'react-native-reanimated';

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const RESET_DURATION_MS = 250;

type ZoomableViewProps = {
  children: ReactNode;
  style?: ViewStyle;
  minZoom?: number;
  maxZoom?: number;
};

/**
 * Wraps children in a pinch-to-zoom + pan gesture container.
 *
 * Uses react-native-gesture-handler (Gesture API) and react-native-reanimated
 * for 60fps animated transforms. The view resets to 1x when double-tapped.
 */
const ZoomableView = React.memo(function ZoomableView({
  children,
  style,
  minZoom = MIN_ZOOM,
  maxZoom = MAX_ZOOM,
}: ZoomableViewProps) {
  // Current committed values (after gesture ends)
  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  // Values at gesture start (saved on begin)
  const savedScale = useSharedValue(1);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  // Container dimensions for clamping pan
  const containerWidth = useSharedValue(0);
  const containerHeight = useSharedValue(0);

  /**
   * Clamp translation so the content stays within bounds.
   * At scale > 1, the content can move by (scale - 1) * dimension / 2 in each direction.
   */
  function clampTranslation(tx: number, ty: number, currentScale: number, width: number, height: number) {
    'worklet';
    const maxTx = Math.max(0, ((currentScale - 1) * width) / 2);
    const maxTy = Math.max(0, ((currentScale - 1) * height) / 2);
    return {
      x: Math.min(maxTx, Math.max(-maxTx, tx)),
      y: Math.min(maxTy, Math.max(-maxTy, ty)),
    };
  }

  const pinchGesture = Gesture.Pinch()
    .onStart(() => {
      'worklet';
      savedScale.value = scale.value;
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    })
    .onUpdate((event) => {
      'worklet';
      const newScale = Math.min(maxZoom, Math.max(minZoom, savedScale.value * event.scale));
      scale.value = newScale;

      // Adjust translation to keep content in bounds as scale changes
      const clamped = clampTranslation(
        savedTranslateX.value,
        savedTranslateY.value,
        newScale,
        containerWidth.value,
        containerHeight.value,
      );
      translateX.value = clamped.x;
      translateY.value = clamped.y;
    })
    .onEnd(() => {
      'worklet';
      // Snap back to minZoom if pinched below threshold
      if (scale.value < minZoom) {
        scale.value = withTiming(minZoom, { duration: RESET_DURATION_MS });
        translateX.value = withTiming(0, { duration: RESET_DURATION_MS });
        translateY.value = withTiming(0, { duration: RESET_DURATION_MS });
      }
    });

  const panGesture = Gesture.Pan()
    .minPointers(1)
    .maxPointers(2)
    .onStart(() => {
      'worklet';
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    })
    .onUpdate((event) => {
      'worklet';
      if (scale.value <= minZoom) return; // No panning at default zoom

      const clamped = clampTranslation(
        savedTranslateX.value + event.translationX,
        savedTranslateY.value + event.translationY,
        scale.value,
        containerWidth.value,
        containerHeight.value,
      );
      translateX.value = clamped.x;
      translateY.value = clamped.y;
    })
    .onEnd((event) => {
      'worklet';
      if (scale.value <= minZoom) return;

      // Apply momentum with decay, clamped to bounds
      const maxTx = Math.max(0, ((scale.value - 1) * containerWidth.value) / 2);
      const maxTy = Math.max(0, ((scale.value - 1) * containerHeight.value) / 2);

      translateX.value = withDecay({
        velocity: event.velocityX,
        clamp: [-maxTx, maxTx],
      });
      translateY.value = withDecay({
        velocity: event.velocityY,
        clamp: [-maxTy, maxTy],
      });
    });

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onStart(() => {
      'worklet';
      // Toggle between 1x and 2.5x zoom
      if (scale.value > minZoom + 0.1) {
        scale.value = withTiming(minZoom, { duration: RESET_DURATION_MS });
        translateX.value = withTiming(0, { duration: RESET_DURATION_MS });
        translateY.value = withTiming(0, { duration: RESET_DURATION_MS });
      } else {
        scale.value = withTiming(2.5, { duration: RESET_DURATION_MS });
      }
    });

  // Compose gestures: pinch and pan are simultaneous, double-tap is exclusive
  const composedGesture = Gesture.Simultaneous(pinchGesture, panGesture, doubleTapGesture);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }, { scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={composedGesture}>
      <Animated.View
        style={[styles.container, style]}
        onLayout={(event) => {
          containerWidth.value = event.nativeEvent.layout.width;
          containerHeight.value = event.nativeEvent.layout.height;
        }}
      >
        <Animated.View style={[styles.content, animatedStyle]}>{children}</Animated.View>
      </Animated.View>
    </GestureDetector>
  );
});

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  content: {
    width: '100%',
    height: '100%',
  },
});

export { ZoomableView };
