import React from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, useDerivedValue, useAnimatedReaction, runOnJS } from 'react-native-reanimated';
import { GestureDetector } from 'react-native-gesture-handler';
import { computePeekOffset, type PeekDirection } from '@boardsesh/play-view';
import type { BoardName } from '@boardsesh/shared-schema';
import { BoardImageNative } from '../BoardImageNative';
import { useCarouselGesture } from './use-carousel-gesture';

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
  enabled = true,
}: SwipeBoardCarouselProps) {
  const { width: screenWidth } = useWindowDimensions();

  const { gesture, translateX } = useCarouselGesture({
    onSwipeNext,
    onSwipePrevious,
    canSwipeNext,
    canSwipePrevious,
    boardWidth: screenWidth,
    enabled,
  });

  const currentStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const peekDirection = useDerivedValue<PeekDirection>(() => (translateX.value < 0 ? 'next' : 'prev'));

  // Mirror direction into JS state so the React tree can swap the peek board's
  // climb frames between renders.
  const [jsDirection, setJsDirection] = React.useState<PeekDirection>('next');
  useAnimatedReaction(
    () => peekDirection.value,
    (direction) => {
      runOnJS(setJsDirection)(direction);
    },
    [peekDirection],
  );

  const peekStyle = useAnimatedStyle(() => {
    if (translateX.value === 0) {
      // Park the peek board off-screen when idle so it does not intercept layout.
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

  return (
    <GestureDetector gesture={gesture}>
      <View style={styles.container}>
        <Animated.View style={[styles.boardWrapper, currentStyle]}>
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
