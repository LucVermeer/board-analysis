import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Pressable, Text, StyleSheet, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  useAnimatedReaction,
  useSharedValue,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useTranslation } from 'react-i18next';
import { computePeekOffset, type PeekDirection } from '@boardsesh/play-view';
import type { BoardName } from '@boardsesh/shared-schema';
import { BoardImageNative } from '../BoardImageNative';
import { Icon } from '../Icon';
import { useCarouselGesture } from './use-carousel-gesture';
import { useZoomPanGesture } from './use-zoom-pan-gesture';
import { timing } from '../../theme/animations';
import { overlays } from '../../theme/tokens';

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
  // Fires whenever the local resetZoom callback identity is established or
  // changes — lets the parent stash it for the tick-FAB flow that needs to
  // reset zoom before opening the tick bar.
  onResetZoomReady?: (resetZoom: () => void) => void;
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
  onResetZoomReady,
  enabled = true,
}: SwipeBoardCarouselProps) {
  const { t } = useTranslation('session');
  const { width: screenWidth } = useWindowDimensions();
  // Starts at 0; populated by onLayout. clampTranslation returns zero for the
  // first frame before layout fires — fine since the user can't pinch in
  // pre-layout. The pinch hook re-reads this value, no remount needed.
  const [containerHeight, setContainerHeight] = useState(0);

  const {
    pinchGesture,
    zoomPanGesture,
    isZoomed,
    isZoomedSV,
    resetZoom,
    animatedZoomStyle,
  } = useZoomPanGesture({
    enabled,
    containerWidth: screenWidth,
    containerHeight,
  });

  const onResetZoomReadyRef = useRef(onResetZoomReady);
  onResetZoomReadyRef.current = onResetZoomReady;

  useEffect(() => {
    onResetZoomReadyRef.current?.(resetZoom);
  }, [resetZoom, onResetZoomReadyRef]);

  // Reset zoom on climb change, but only if actually zoomed — otherwise it's
  // just a no-op withTiming(1→1) and a setState(false→false).
  const prevFramesRef = useRef(currentFrames);
  useEffect(() => {
    if (prevFramesRef.current !== currentFrames) {
      prevFramesRef.current = currentFrames;
      if (isZoomed) resetZoom();
    }
  }, [currentFrames, isZoomed, resetZoom]);

  const { gesture: swipeGesture, translateX } = useCarouselGesture({
    onSwipeNext,
    onSwipePrevious,
    canSwipeNext,
    canSwipePrevious,
    boardWidth: screenWidth,
    enabled,
    isZoomedSV,
  });

  const resetButtonOpacity = useSharedValue(0);
  useEffect(() => {
    resetButtonOpacity.value = withTiming(isZoomed ? 1 : 0, { duration: timing.fast });
  }, [isZoomed, resetButtonOpacity]);

  const resetButtonStyle = useAnimatedStyle(() => ({
    opacity: resetButtonOpacity.value,
  }));

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

  // Stable composition: never swap based on state. Each gesture gates itself
  // on shared values in its worklets, so the composition can be built once and
  // RNGH never re-registers handlers mid-session.
  const composedGesture = React.useMemo(
    () => Gesture.Simultaneous(pinchGesture, zoomPanGesture, swipeGesture),
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

        <Animated.View
          style={[styles.resetZoomWrapper, resetButtonStyle]}
          pointerEvents={isZoomed ? 'auto' : 'none'}
        >
          <Pressable
            onPress={resetZoom}
            style={styles.resetZoomButton}
            accessibilityRole="button"
            accessibilityLabel={t('playView.resetZoom')}
            hitSlop={8}
          >
            <Icon name="crop.free" size={14} color={overlays.onScrim} />
            <Text style={styles.resetZoomLabel}>{t('playView.resetZoom')}</Text>
          </Pressable>
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
  resetZoomWrapper: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 10,
  },
  resetZoomButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: overlays.scrim,
  },
  resetZoomLabel: {
    color: overlays.onScrim,
    fontSize: 12,
    fontWeight: '500',
  },
});
