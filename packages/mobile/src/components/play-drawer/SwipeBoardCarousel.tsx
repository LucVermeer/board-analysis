import React, { useMemo } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, useDerivedValue, type SharedValue } from 'react-native-reanimated';
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

  const isSwiping = useDerivedValue(() => translateX.value !== 0);

  const peekDirection = useDerivedValue(() => (translateX.value < 0 ? 'next' : 'prev'));

  const peekStyle = useAnimatedStyle(() => {
    if (!isSwiping.value) return { opacity: 0, transform: [{ translateX: screenWidth }] };

    const peekOffset =
      peekDirection.value === 'next'
        ? screenWidth + translateX.value
        : -screenWidth + translateX.value;

    return {
      opacity: 1,
      transform: [{ translateX: peekOffset }],
    };
  });

  const peekFrames = useMemo(() => {
    return { next: nextFrames, prev: prevFrames };
  }, [nextFrames, prevFrames]);

  const { boardWidth, boardHeight, imageUrls, holdsData } = boardRenderData;

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

        {/* Peek board — shows next/prev during swipe */}
        <Animated.View style={[styles.peekWrapper, peekStyle]}>
          <PeekBoard
            boardName={boardName}
            boardWidth={boardWidth}
            boardHeight={boardHeight}
            imageUrls={imageUrls}
            holdsData={holdsData}
            mirrored={mirrored}
            nextFrames={peekFrames.next}
            prevFrames={peekFrames.prev}
            peekDirection={peekDirection}
          />
        </Animated.View>
      </View>
    </GestureDetector>
  );
});

type PeekBoardProps = {
  boardName: BoardName;
  boardWidth: number;
  boardHeight: number;
  imageUrls: string[];
  holdsData: HoldPlacement[];
  mirrored: boolean;
  nextFrames: string | null;
  prevFrames: string | null;
  peekDirection: SharedValue<'next' | 'prev'>;
};

const PeekBoard = React.memo(function PeekBoard({
  boardName,
  boardWidth,
  boardHeight,
  imageUrls,
  holdsData,
  mirrored,
  nextFrames,
  prevFrames,
}: PeekBoardProps) {
  const frames = nextFrames ?? prevFrames;
  if (!frames) return null;

  return (
    <BoardRenderer
      frames={frames}
      boardName={boardName}
      boardWidth={boardWidth}
      boardHeight={boardHeight}
      imageUrls={imageUrls}
      holdsData={holdsData}
      mirrored={mirrored}
    />
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
