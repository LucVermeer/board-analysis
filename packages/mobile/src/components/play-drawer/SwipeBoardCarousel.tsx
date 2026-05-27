import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, StyleSheet, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  useAnimatedReaction,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { computePeekOffset, type PeekDirection } from '@boardsesh/play-view';
import type { BoardName } from '@boardsesh/shared-schema';
import { BoardImageNative } from '../BoardImageNative';
import { useCarouselGesture } from './use-carousel-gesture';
import { useZoomPanGesture } from './use-zoom-pan-gesture';

type BoardRenderData = {
  boardWidth: number;
  boardHeight: number;
};

type SwipeBoardCarouselProps = {
  boardName: BoardName;
  boardRenderData: BoardRenderData;
  layoutId: number;
  sizeId: number;
  setIds: string;
  currentFrames: string;
  nextFrames: string | null;
  prevFrames: string | null;
  mirrored: boolean;
  canSwipeNext: boolean;
  canSwipePrevious: boolean;
  onSwipeNext: () => void;
  onSwipePrevious: () => void;
  onZoomChange?: (isZoomed: boolean, resetZoom: () => void) => void;
  enabled?: boolean;
};

export const SwipeBoardCarousel = React.memo(function SwipeBoardCarousel({
  boardName,
  boardRenderData,
  layoutId,
  sizeId,
  setIds,
  currentFrames,
  nextFrames,
  prevFrames,
  mirrored,
  canSwipeNext,
  canSwipePrevious,
  onSwipeNext,
  onSwipePrevious,
  onZoomChange,
  enabled = true,
}: SwipeBoardCarouselProps) {
  const { width: screenWidth } = useWindowDimensions();
  const [containerHeight, setContainerHeight] = useState(0);

  const {
    pinchGesture,
    zoomPanGesture,
    isZoomed,
    resetZoom,
    animatedZoomStyle,
  } = useZoomPanGesture({
    enabled,
    containerWidth: screenWidth,
    containerHeight,
  });

  const onZoomChangeRef = useRef(onZoomChange);
  onZoomChangeRef.current = onZoomChange;

  useEffect(() => {
    onZoomChangeRef.current?.(isZoomed, resetZoom);
  }, [isZoomed, resetZoom]);

  // Reset zoom when climb changes
  const prevFramesRef = useRef(currentFrames);
  useEffect(() => {
    if (prevFramesRef.current !== currentFrames) {
      prevFramesRef.current = currentFrames;
      resetZoom();
    }
  }, [currentFrames, resetZoom]);

  const { gesture: swipeGesture, translateX } = useCarouselGesture({
    onSwipeNext,
    onSwipePrevious,
    canSwipeNext,
    canSwipePrevious,
    boardWidth: screenWidth,
    enabled: enabled && !isZoomed,
  });

  const currentStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const peekDirection = useDerivedValue<PeekDirection>(() => (translateX.value < 0 ? 'next' : 'prev'));

  const [jsDirection, setJsDirection] = useState<PeekDirection>('next');
  useAnimatedReaction(
    () => peekDirection.value,
    (direction) => {
      runOnJS(setJsDirection)(direction);
    },
    [peekDirection],
  );

  const peekStyle = useAnimatedStyle(() => {
    if (translateX.value === 0) {
      return { opacity: 0, transform: [{ translateX: screenWidth }] };
    }
    const offset = computePeekOffset({
      direction: peekDirection.value,
      swipeOffset: translateX.value,
      viewportWidth: screenWidth,
    });
    return { opacity: 1, transform: [{ translateX: offset }] };
  });

  const { boardWidth, boardHeight } = boardRenderData;
  const peekFrames = jsDirection === 'next' ? nextFrames : prevFrames;

  const composedGesture = React.useMemo(
    () => Gesture.Simultaneous(pinchGesture, Gesture.Race(zoomPanGesture, swipeGesture)),
    [pinchGesture, zoomPanGesture, swipeGesture],
  );

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    setContainerHeight(event.nativeEvent.layout.height);
  }, []);

  return (
    <GestureDetector gesture={composedGesture}>
      <View style={styles.container} onLayout={handleLayout}>
        <Animated.View style={[styles.boardWrapper, currentStyle]}>
          <Animated.View style={animatedZoomStyle}>
            <BoardImageNative
              frames={currentFrames}
              boardName={boardName}
              layoutId={layoutId}
              sizeId={sizeId}
              setIds={setIds}
              boardWidth={boardWidth}
              boardHeight={boardHeight}
              mirrored={mirrored}
            />
          </Animated.View>
        </Animated.View>

        <Animated.View style={[styles.peekWrapper, peekStyle]} pointerEvents="none">
          {peekFrames && (
            <BoardImageNative
              frames={peekFrames}
              boardName={boardName}
              layoutId={layoutId}
              sizeId={sizeId}
              setIds={setIds}
              boardWidth={boardWidth}
              boardHeight={boardHeight}
              mirrored={mirrored}
            />
          )}
        </Animated.View>
      </View>
    </GestureDetector>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    overflow: 'hidden',
  },
  boardWrapper: {
    width: '100%',
  },
  peekWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
});
