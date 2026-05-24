import React from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, useDerivedValue, useAnimatedReaction, runOnJS } from 'react-native-reanimated';
import { GestureDetector } from 'react-native-gesture-handler';
import type { BoardName } from '@boardsesh/shared-schema';
import { BoardRenderer } from '../board-renderer';
import { useCarouselGesture } from './use-carousel-gesture';
import type { HoldPlacement } from '../board-renderer/types';

type BoardRenderData = {
  boardWidth: number;
  boardHeight: number;
  imageUrls: string[];
  holdsData: HoldPlacement[];
};

type SwipeBoardCarouselProps = {
  boardName: BoardName;
  boardRenderData: BoardRenderData;
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

  const peekDirection = useDerivedValue(() => (translateX.value < 0 ? 'next' : 'prev'));

  // Track direction in JS state so PeekBoard can select the correct frames
  const [jsDirection, setJsDirection] = React.useState<'next' | 'prev'>('next');
  useAnimatedReaction(
    () => peekDirection.value,
    (direction) => {
      runOnJS(setJsDirection)(direction);
    },
    [peekDirection],
  );

  const peekStyle = useAnimatedStyle(() => {
    const isSwiping = translateX.value !== 0;
    if (!isSwiping) return { opacity: 0, transform: [{ translateX: screenWidth }] };

    const peekOffset =
      peekDirection.value === 'next'
        ? screenWidth + translateX.value
        : -screenWidth + translateX.value;

    return {
      opacity: 1,
      transform: [{ translateX: peekOffset }],
    };
  });

  const { boardWidth, boardHeight, imageUrls, holdsData } = boardRenderData;
  const peekFrames = jsDirection === 'next' ? nextFrames : prevFrames;

  return (
    <GestureDetector gesture={gesture}>
      <View style={styles.container}>
        <Animated.View style={[styles.boardWrapper, currentStyle]}>
          <BoardRenderer
            frames={currentFrames}
            boardName={boardName}
            boardWidth={boardWidth}
            boardHeight={boardHeight}
            imageUrls={imageUrls}
            holdsData={holdsData}
            mirrored={mirrored}
          />
        </Animated.View>

        <Animated.View style={[styles.peekWrapper, peekStyle]}>
          {peekFrames && (
            <BoardRenderer
              frames={peekFrames}
              boardName={boardName}
              boardWidth={boardWidth}
              boardHeight={boardHeight}
              imageUrls={imageUrls}
              holdsData={holdsData}
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
