/**
 * PersistentQueueBar — bottom-anchored control bar that mounts at the app
 * root and is visible on every screen while a current climb is set.
 *
 * Layout (condensed for mobile, no thumbnail per design):
 *   [grade] climb name…              [BT] [✓ tick]
 *      ↑ tap opens PlayDrawer    ↑ horizontal swipe = prev/next
 *
 * The horizontal swipe mirrors the play-drawer carousel pattern
 * (`use-carousel-gesture`), reusing the shared timings + peek math from
 * `@boardsesh/play-view` so the bar and drawer feel identical.
 */

import { useCallback, useMemo, useState } from 'react';
import { View, StyleSheet, useColorScheme, type ColorValue, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn, runOnJS, useAnimatedStyle, useDerivedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { computePeekOffset, getGradeTintColor } from '@boardsesh/play-view';
import { getGradeColor, DEFAULT_GRADE_COLOR } from '@boardsesh/board-constants/grade-colors';
import type { ClimbQueueItem } from '@boardsesh/queue';
import { iosSystemColors } from '../../theme/ios-colors';
import { shadowColor, spacing } from '../../theme/tokens';
import { withAlpha } from '../../theme/colors';
import { useGradeFormat } from '../../hooks/use-grade-format';
import { Text } from '../Text';
import { Icon } from '../Icon';
import { PressableSurface } from '../PressableSurface';
import { BleLightbulbButton } from '../ble/BleLightbulbButton';
import { useTheme } from '../../providers/theme-provider';
import { useQueue } from '../../providers/queue-provider';
import { useOptionalBluetoothContext } from '../../providers/bluetooth-provider';
import { useDrawerHost } from '../../providers/drawer-host-provider';
import { hapticSelection } from '../../lib/haptics';
import { useCarouselGesture } from '../play-drawer/use-carousel-gesture';
import { TAB_BAR_HEIGHT } from '../BlurTabBar';
import { BAR_CONTENT_HEIGHT } from '../../theme/layout';

// Re-export so layout consumers that already import bar metrics from this
// module don't need to know which file owns them. Source of truth: theme/layout.
export { BAR_CONTENT_HEIGHT, TAB_BAR_HEIGHT };

type ClimbDisplay = {
  difficulty: string | null | undefined;
  name: string | undefined;
};

function climbDisplay(item: ClimbQueueItem | null | undefined): ClimbDisplay | null {
  if (!item?.climb) return null;
  return {
    difficulty: item.climb.difficulty,
    name: item.climb.name,
  };
}

type ClimbLabelProps = {
  display: ClimbDisplay;
  labelColor: ColorValue;
  formattedGrade: string | null;
  chipBackground: string;
};

function ClimbLabel({ display, labelColor, formattedGrade, chipBackground }: ClimbLabelProps) {
  return (
    <View style={styles.labelInner}>
      {formattedGrade ? (
        <View style={[styles.gradePill, { backgroundColor: chipBackground }]}>
          <Text variant="caption1" color={iosSystemColors.white} style={styles.gradeText}>
            {formattedGrade}
          </Text>
        </View>
      ) : null}
      <Text variant="subheadline" color={labelColor} numberOfLines={1} ellipsizeMode="tail" style={styles.name}>
        {display.name ?? ''}
      </Text>
    </View>
  );
}

export function PersistentQueueBar() {
  const { state, nextClimb, previousClimb, sessionId } = useQueue();
  const { boardConfig, openPlayDrawer, openLogAscent } = useDrawerHost();
  const bluetooth = useOptionalBluetoothContext();
  const insets = useSafeAreaInsets();
  const { systemColors, brandColors } = useTheme();
  const { t } = useTranslation('session');
  const { t: tSettings } = useTranslation('settings');
  const { t: tCommon } = useTranslation('common');
  const { formatGrade: format } = useGradeFormat();
  const isDark = useColorScheme() === 'dark';

  const [barWidth, setBarWidth] = useState(0);

  const { currentClimbQueueItem, queue } = state;

  const currentIndex = useMemo(() => {
    if (!currentClimbQueueItem) return -1;
    return queue.findIndex(({ uuid }) => uuid === currentClimbQueueItem.uuid);
  }, [queue, currentClimbQueueItem]);

  const canPrevious = currentIndex > 0;
  const canNext = currentIndex >= 0 && currentIndex < queue.length - 1;
  const previousItem = canPrevious ? queue[currentIndex - 1] : null;
  const nextItem = canNext ? queue[currentIndex + 1] : null;

  const handleNext = useCallback(() => {
    hapticSelection();
    nextClimb();
  }, [nextClimb]);

  const handlePrevious = useCallback(() => {
    hapticSelection();
    previousClimb();
  }, [previousClimb]);

  const { gesture: panGesture, translateX } = useCarouselGesture({
    onSwipeNext: handleNext,
    onSwipePrevious: handlePrevious,
    canSwipeNext: canNext,
    canSwipePrevious: canPrevious,
    boardWidth: barWidth,
    enabled: barWidth > 0,
  });

  const handleOpenPlay = useCallback(() => {
    if (!currentClimbQueueItem?.climb) return;
    // The bar is opening the drawer for the already-current climb; opting
    // out of setAsCurrent avoids duplicating it at the end of the queue.
    openPlayDrawer(currentClimbQueueItem.climb, { setAsCurrent: false });
  }, [openPlayDrawer, currentClimbQueueItem]);

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

  const composedGesture = useMemo(() => Gesture.Race(panGesture, tapGesture), [panGesture, tapGesture]);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setBarWidth(event.nativeEvent.layout.width);
  }, []);

  const currentLabelStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const nextPeekX = useDerivedValue(() =>
    computePeekOffset({ direction: 'next', swipeOffset: translateX.value, viewportWidth: barWidth }),
  );
  const prevPeekX = useDerivedValue(() =>
    computePeekOffset({ direction: 'prev', swipeOffset: translateX.value, viewportWidth: barWidth }),
  );

  const nextPeekStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: nextPeekX.value }],
  }));
  const prevPeekStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: prevPeekX.value }],
  }));

  const handleTick = useCallback(() => {
    if (!currentClimbQueueItem?.climb || !boardConfig) return;
    hapticSelection();
    openLogAscent({
      climbUuid: currentClimbQueueItem.climb.uuid,
      boardName: boardConfig.boardName,
      angle: currentClimbQueueItem.climb.angle,
      isMirror: currentClimbQueueItem.climb.mirrored === true,
      isBenchmark: currentClimbQueueItem.climb.benchmark_difficulty != null,
      layoutId: boardConfig.layoutId,
      sizeId: boardConfig.sizeId,
      setIds: boardConfig.setIds,
      sessionId,
      consensusGradeName: currentClimbQueueItem.climb.difficulty,
    });
  }, [openLogAscent, currentClimbQueueItem, boardConfig, sessionId]);

  const handleBluetoothPress = useCallback(() => {
    if (!bluetooth) return;
    if (bluetooth.isConnected) void bluetooth.disconnect();
    else void bluetooth.connect();
  }, [bluetooth]);

  const currentDisplay = climbDisplay(currentClimbQueueItem);
  const previousDisplay = climbDisplay(previousItem);
  const nextDisplay = climbDisplay(nextItem);

  if (!currentDisplay) return null;

  // VoiceOver transport: swipe prev/next is invisible to assistive tech, so
  // expose the same navigation as custom accessibility actions on the swipe
  // area (rotor / two-finger swipe), gated on the same edge guards as the swipe.
  const swipeAccessibilityActions = [
    ...(canPrevious ? [{ name: 'previous', label: t('mobile.queue.previousClimb') }] : []),
    ...(canNext ? [{ name: 'next', label: t('mobile.queue.nextClimb') }] : []),
  ];

  // Soft pastel tint derived from the current climb's grade, matching the web
  // queue bar's `getGradeTintColor(difficulty, 'default', isDark)` call.
  // Falls back to the neutral system background when the grade is unrecognised.
  const tintBackground = getGradeTintColor(currentDisplay.difficulty, 'default', isDark);

  const currentFormatted = format(currentDisplay.difficulty);
  const previousFormatted = previousDisplay ? format(previousDisplay.difficulty) : null;
  const nextFormatted = nextDisplay ? format(nextDisplay.difficulty) : null;

  // Vivid grade color (`getGradeColor` raw hex) for the chip, matching the
  // PlayDrawer header pill. Falls back to the default neutral grade color when
  // the difficulty is unrecognised.
  const currentChipColor = getGradeColor(currentDisplay.difficulty) ?? DEFAULT_GRADE_COLOR;
  const previousChipColor = previousDisplay
    ? (getGradeColor(previousDisplay.difficulty) ?? DEFAULT_GRADE_COLOR)
    : DEFAULT_GRADE_COLOR;
  const nextChipColor = nextDisplay
    ? (getGradeColor(nextDisplay.difficulty) ?? DEFAULT_GRADE_COLOR)
    : DEFAULT_GRADE_COLOR;

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      pointerEvents="box-none"
      style={[
        styles.bar,
        {
          // Sit directly above the BlurTabBar — side margins + rounded
          // corners give the floating-card look; no extra vertical gap.
          bottom: insets.bottom + TAB_BAR_HEIGHT,
          // Opaque base so the bar stays readable over scrolling content —
          // Liquid Glass is too see-through for a text-bearing floating bar.
          // The grade hue is layered on top as a solid card tint.
          backgroundColor: systemColors.background,
        },
      ]}
    >
      {tintBackground ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: tintBackground }]} />
      ) : null}
      <View style={styles.row}>
        <GestureDetector gesture={composedGesture}>
          <View
            style={styles.swipeArea}
            onLayout={onLayout}
            accessibilityRole="button"
            accessibilityLabel={currentDisplay.name}
            accessibilityActions={swipeAccessibilityActions}
            onAccessibilityAction={(event) => {
              if (event.nativeEvent.actionName === 'next') handleNext();
              else if (event.nativeEvent.actionName === 'previous') handlePrevious();
            }}
          >
            <Animated.View style={[styles.labelSlot, currentLabelStyle]}>
              <ClimbLabel
                display={currentDisplay}
                labelColor={systemColors.label}
                formattedGrade={currentFormatted}
                chipBackground={currentChipColor}
              />
            </Animated.View>
            {nextDisplay ? (
              <Animated.View style={[styles.peekSlot, nextPeekStyle]} pointerEvents="none">
                <ClimbLabel
                  display={nextDisplay}
                  labelColor={systemColors.label}
                  formattedGrade={nextFormatted}
                  chipBackground={nextChipColor}
                />
              </Animated.View>
            ) : null}
            {previousDisplay ? (
              <Animated.View style={[styles.peekSlot, prevPeekStyle]} pointerEvents="none">
                <ClimbLabel
                  display={previousDisplay}
                  labelColor={systemColors.label}
                  formattedGrade={previousFormatted}
                  chipBackground={previousChipColor}
                />
              </Animated.View>
            ) : null}
          </View>
        </GestureDetector>

        {bluetooth ? (
          <BleLightbulbButton
            isConnected={bluetooth.isConnected}
            isScanning={bluetooth.loading}
            onPress={handleBluetoothPress}
            accessibilityLabel={
              bluetooth.isConnected ? tCommon('lightControl.disconnect') : tSettings('ble.connectBoard')
            }
            scanningAccessibilityHint={tSettings('ble.scanning')}
            restingBackgroundColor={systemColors.fill}
          />
        ) : null}

        <PressableSurface
          feedback="scale"
          scaleTo={0.92}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('mobile.queue.logAscent')}
          onPress={handleTick}
          disabled={!currentClimbQueueItem || !boardConfig}
          style={[
            styles.iconButton,
            { backgroundColor: withAlpha(brandColors.primary, 0.18), borderColor: systemColors.separator },
          ]}
        >
          <Icon name="tick" size={26} color={brandColors.primary} />
        </PressableSurface>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 8,
    right: 8,
    // `bottom` is set inline from safe-area insets + tab-bar height so
    // the bar sits flush against the tab bar with all four corners
    // rounded (Spotify mini-player style).
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: BAR_CONTENT_HEIGHT,
    paddingHorizontal: 12,
    gap: spacing[2],
  },
  swipeArea: {
    flex: 1,
    height: BAR_CONTENT_HEIGHT,
    overflow: 'hidden',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  labelSlot: {
    position: 'absolute',
    left: 4,
    right: 4,
    justifyContent: 'center',
  },
  peekSlot: {
    position: 'absolute',
    left: 4,
    right: 4,
    justifyContent: 'center',
  },
  labelInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  gradePill: {
    // Reserve a 3-char slot ("V10") so the climb name doesn't shift
    // horizontally as the user swipes between climbs with different
    // grade widths. 4-char grades like "V10+" still expand slightly.
    minWidth: 40,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradeText: {
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
    textAlign: 'center',
  },
  name: {
    flex: 1,
    fontWeight: '600',
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    // Hairline border keeps the tonal fill legible over the grade-tint
    // overlay. The fill + border colour are set inline from runtime
    // `systemColors`/`brandColors` (PlatformColor can't live in StyleSheet).
    borderWidth: StyleSheet.hairlineWidth,
  },
});
