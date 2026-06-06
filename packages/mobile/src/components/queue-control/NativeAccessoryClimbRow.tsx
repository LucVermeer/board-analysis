import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View, type ColorValue, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useDerivedValue } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import type { BoardName } from '@boardsesh/shared-schema';
import type { Climb, ClimbQueueItem } from '@boardsesh/queue';
import { computePeekOffset } from '@boardsesh/play-view';
import { getBoardRenderData } from '../../lib/board-details';
import { useGradeFormat } from '../../hooks/use-grade-format';
import { useReduceMotion } from '../../hooks/use-reduce-motion';
import { useTheme } from '../../providers/theme-provider';
import { useQueue } from '../../providers/queue-provider';
import { useDrawerHost, type BoardConfig } from '../../providers/drawer-host-provider';
import { hapticLight, hapticSelection } from '../../lib/haptics';
import { spacing } from '../../theme/tokens';
import { glassSize } from '../../theme/layout';
import { Text } from '../Text';
import { BoardRenderer } from '../board-renderer/BoardRenderer';
import { useCarouselGesture } from '../play-drawer/use-carousel-gesture';
import { LogAscentToolbarButton } from './LogAscentToolbarButton';

type AccessoryPlacement = 'regular' | 'inline';

type NativeAccessoryClimbRowProps = {
  placement: AccessoryPlacement;
  width: number;
};

const ACCESSORY_LEADING_INSET = spacing[1];
const ACCESSORY_TRAILING_INSET = spacing[3];
const ACCESSORY_THUMBNAIL_SLOT_SIZE = 40;
const ACCESSORY_THUMBNAIL_ART_MAX_SIZE = 40;
const ACCESSORY_THUMBNAIL_ART_RADIUS = 10;

type ClimbLabelProps = {
  climb: Climb;
  labelColor: ColorValue;
  formattedGrade: string | null;
  showThumbnail: boolean;
  boardConfig: BoardConfig | null;
};

function getAccessoryThumbnailBoardSize(boardWidth: number, boardHeight: number) {
  const boardAspectRatio = boardWidth / boardHeight;
  if (!Number.isFinite(boardAspectRatio) || boardAspectRatio <= 0) {
    return {
      width: ACCESSORY_THUMBNAIL_ART_MAX_SIZE,
      height: ACCESSORY_THUMBNAIL_ART_MAX_SIZE,
    };
  }

  if (boardAspectRatio >= 1) {
    return {
      width: ACCESSORY_THUMBNAIL_ART_MAX_SIZE,
      height: ACCESSORY_THUMBNAIL_ART_MAX_SIZE / boardAspectRatio,
    };
  }

  return {
    width: ACCESSORY_THUMBNAIL_ART_MAX_SIZE * boardAspectRatio,
    height: ACCESSORY_THUMBNAIL_ART_MAX_SIZE,
  };
}

function AccessoryClimbThumbnail({ climb, boardConfig }: { climb: Climb; boardConfig: BoardConfig | null }) {
  const boardRenderData = useMemo(() => {
    if (!boardConfig) return null;
    const setIdValues = boardConfig.setIds
      .split(',')
      .map((setIdText) => Number(setIdText))
      .filter((setIdValue) => Number.isFinite(setIdValue));
    if (setIdValues.length === 0) return null;
    return getBoardRenderData({
      boardName: boardConfig.boardName as BoardName,
      layoutId: boardConfig.layoutId,
      sizeId: boardConfig.sizeId,
      setIds: setIdValues,
    });
  }, [boardConfig]);

  if (!boardRenderData) return null;

  const thumbnailBoardStyle = {
    ...getAccessoryThumbnailBoardSize(boardRenderData.boardWidth, boardRenderData.boardHeight),
    borderRadius: ACCESSORY_THUMBNAIL_ART_RADIUS,
    overflow: 'hidden' as const,
  };

  return (
    <View style={styles.thumbnailSlot}>
      <BoardRenderer
        frames={climb.frames}
        boardName={boardConfig?.boardName as BoardName}
        boardWidth={boardRenderData.boardWidth}
        boardHeight={boardRenderData.boardHeight}
        imageUrls={boardRenderData.imageUrls}
        holdsData={boardRenderData.holdsData}
        mirrored={climb.mirrored === true}
        fillContainer
        style={thumbnailBoardStyle}
      />
    </View>
  );
}

function ClimbLabel({ climb, labelColor, formattedGrade, showThumbnail, boardConfig }: ClimbLabelProps) {
  return (
    <View style={styles.labelInner}>
      {showThumbnail ? <AccessoryClimbThumbnail climb={climb} boardConfig={boardConfig} /> : null}
      <Text variant="subheadline" color={labelColor} numberOfLines={1} ellipsizeMode="tail" style={styles.name}>
        {climb.name}
      </Text>
      {formattedGrade ? (
        <Text variant="subheadline" color={labelColor} numberOfLines={1} style={styles.gradeText}>
          {formattedGrade}
        </Text>
      ) : null}
    </View>
  );
}

function climbFromItem(item: ClimbQueueItem | null | undefined): Climb | null {
  return item?.climb ?? null;
}

export function NativeAccessoryClimbRow({ placement, width }: NativeAccessoryClimbRowProps) {
  const { state, nextClimb: navigateNextClimb, previousClimb: navigatePreviousClimb } = useQueue();
  const { boardConfig, openPlayDrawer } = useDrawerHost();
  const { systemColors } = useTheme();
  const { t } = useTranslation('session');
  const { formatGrade } = useGradeFormat();
  const reduceMotion = useReduceMotion();
  const [clipWidth, setClipWidth] = useState(0);

  const { currentClimbQueueItem, queue } = state;
  const currentClimb = climbFromItem(currentClimbQueueItem);

  const currentIndex = useMemo(() => {
    if (!currentClimbQueueItem) return -1;
    return queue.findIndex(({ uuid }) => uuid === currentClimbQueueItem.uuid);
  }, [queue, currentClimbQueueItem]);

  const canPrevious = currentIndex > 0;
  const canNext = currentIndex >= 0 && currentIndex < queue.length - 1;
  const previousClimb = climbFromItem(canPrevious ? queue[currentIndex - 1] : null);
  const nextQueueClimb = climbFromItem(canNext ? queue[currentIndex + 1] : null);
  const showThumbnail = placement === 'regular' && boardConfig !== null;

  const handleNext = useCallback(() => {
    hapticSelection();
    navigateNextClimb();
  }, [navigateNextClimb]);

  const handlePrevious = useCallback(() => {
    hapticSelection();
    navigatePreviousClimb();
  }, [navigatePreviousClimb]);

  const handleOpenPlay = useCallback(() => {
    if (!currentClimb) return;
    hapticLight();
    openPlayDrawer(currentClimb, { setAsCurrent: false });
  }, [openPlayDrawer, currentClimb]);

  const { gesture: panGesture, translateX } = useCarouselGesture({
    onSwipeNext: handleNext,
    onSwipePrevious: handlePrevious,
    canSwipeNext: canNext,
    canSwipePrevious: canPrevious,
    boardWidth: clipWidth,
    enabled: clipWidth > 0,
    reduceMotion,
  });

  const tapGesture = useMemo(
    () =>
      Gesture.Tap()
        .maxDuration(250)
        .onEnd(() => {
          'worklet';
          runOnJS(handleOpenPlay)();
        }),
    [handleOpenPlay],
  );

  const swipeUpGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY(-12)
        .failOffsetX([-20, 20])
        .onEnd((event) => {
          'worklet';
          if (event.translationY < -40 || event.velocityY < -600) {
            runOnJS(handleOpenPlay)();
          }
        }),
    [handleOpenPlay],
  );

  const composedGesture = useMemo(
    () => Gesture.Race(panGesture, swipeUpGesture, tapGesture),
    [panGesture, swipeUpGesture, tapGesture],
  );

  const onClipLayout = useCallback((event: LayoutChangeEvent) => {
    setClipWidth(event.nativeEvent.layout.width);
  }, []);

  const currentLabelStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));
  const nextPeekX = useDerivedValue(() =>
    computePeekOffset({ direction: 'next', swipeOffset: translateX.value, viewportWidth: clipWidth }),
  );
  const previousPeekX = useDerivedValue(() =>
    computePeekOffset({ direction: 'prev', swipeOffset: translateX.value, viewportWidth: clipWidth }),
  );
  const nextPeekStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: nextPeekX.value }],
  }));
  const previousPeekStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: previousPeekX.value }],
  }));

  if (!currentClimb) return null;

  const rowHeight = placement === 'inline' ? glassSize.inline : glassSize.standard;
  const currentFormattedGrade = formatGrade(currentClimb.difficulty);
  const previousFormattedGrade = previousClimb ? formatGrade(previousClimb.difficulty) : null;
  const nextFormattedGrade = nextQueueClimb ? formatGrade(nextQueueClimb.difficulty) : null;
  const swipeAccessibilityActions = [
    ...(canPrevious ? [{ name: 'previous', label: t('mobile.queue.previousClimb') }] : []),
    ...(canNext ? [{ name: 'next', label: t('mobile.queue.nextClimb') }] : []),
  ];

  return (
    <View style={[styles.row, { width, height: rowHeight }]}>
      <GestureDetector gesture={composedGesture}>
        <View
          style={styles.swipeClip}
          onLayout={onClipLayout}
          accessibilityRole="button"
          accessibilityLabel={currentClimb.name}
          accessibilityActions={swipeAccessibilityActions}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === 'next') handleNext();
            else if (event.nativeEvent.actionName === 'previous') handlePrevious();
          }}
        >
          <Animated.View style={[styles.labelSlot, currentLabelStyle]}>
            <ClimbLabel
              climb={currentClimb}
              labelColor={systemColors.label}
              formattedGrade={currentFormattedGrade}
              showThumbnail={showThumbnail}
              boardConfig={boardConfig}
            />
          </Animated.View>
          {nextQueueClimb ? (
            <Animated.View style={[styles.peekSlot, nextPeekStyle]} pointerEvents="none">
              <ClimbLabel
                climb={nextQueueClimb}
                labelColor={systemColors.label}
                formattedGrade={nextFormattedGrade}
                showThumbnail={showThumbnail}
                boardConfig={boardConfig}
              />
            </Animated.View>
          ) : null}
          {previousClimb ? (
            <Animated.View style={[styles.peekSlot, previousPeekStyle]} pointerEvents="none">
              <ClimbLabel
                climb={previousClimb}
                labelColor={systemColors.label}
                formattedGrade={previousFormattedGrade}
                showThumbnail={showThumbnail}
                boardConfig={boardConfig}
              />
            </Animated.View>
          ) : null}
        </View>
      </GestureDetector>
      <View style={[styles.tickSlot, { width: glassSize.inline, height: rowHeight }]}>
        <LogAscentToolbarButton climb={currentClimb} size={glassSize.inline} iconSize={24} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: ACCESSORY_LEADING_INSET,
    paddingRight: ACCESSORY_TRAILING_INSET,
  },
  swipeClip: {
    flex: 1,
    minWidth: 0,
    height: '100%',
    overflow: 'hidden',
    justifyContent: 'center',
  },
  labelSlot: {
    justifyContent: 'center',
    height: '100%',
  },
  peekSlot: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  labelInner: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
    gap: spacing[2],
    paddingLeft: spacing[2],
    paddingRight: spacing[1],
  },
  thumbnailSlot: {
    width: ACCESSORY_THUMBNAIL_SLOT_SIZE,
    height: ACCESSORY_THUMBNAIL_SLOT_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  name: {
    flex: 1,
    minWidth: 0,
    fontWeight: '500',
  },
  gradeText: {
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
    minWidth: spacing[10],
    textAlign: 'right',
  },
  tickSlot: {
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
});
