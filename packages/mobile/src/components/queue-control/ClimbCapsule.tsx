// The toolbar's center element: a frosted-glass pill showing the current climb's
// name with the grade colorized on the right — the same treatment as the climb
// list rows. Tap opens the PlayDrawer; horizontal swipe steps the queue
// (prev/next) with the neighbouring climb peeking in — the same carousel feel as
// the play drawer. A faint grade wash tints the glass. Extracted from the old
// queue bar so the swipe/peek + drawer wiring is shared.

import { type ReactNode, useCallback, useMemo, useState } from 'react';
import { View, StyleSheet, type ColorValue, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useDerivedValue } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { computePeekOffset } from '@boardsesh/play-view';
import { getGradeColor, DEFAULT_GRADE_COLOR } from '@boardsesh/board-constants/grade-colors';
import type { ClimbQueueItem } from '@boardsesh/queue';
import { shadows } from '../../theme/tokens';
import { TOOLBAR_CAPSULE_HEIGHT, TOOLBAR_CAPSULE_MAX_WIDTH } from '../../theme/layout';
import { useGradeFormat } from '../../hooks/use-grade-format';
import { useReduceMotion } from '../../hooks/use-reduce-motion';
import { useNativeGlass } from '../../hooks/use-native-glass';
import { Text } from '../Text';
import { GlassSurface } from '../GlassSurface';
import { useTheme } from '../../providers/theme-provider';
import { useQueue } from '../../providers/queue-provider';
import { useDrawerHost } from '../../providers/drawer-host-provider';
import { hapticLight, hapticSelection } from '../../lib/haptics';
import { useCarouselGesture } from '../play-drawer/use-carousel-gesture';

const CAPSULE_RADIUS = TOOLBAR_CAPSULE_HEIGHT / 2;

type ClimbDisplay = {
  difficulty: string | null | undefined;
  name: string | undefined;
};

function climbDisplay(item: ClimbQueueItem | null | undefined): ClimbDisplay | null {
  if (!item?.climb) return null;
  return { difficulty: item.climb.difficulty, name: item.climb.name };
}

type ClimbLabelProps = {
  display: ClimbDisplay;
  labelColor: ColorValue;
  formattedGrade: string | null;
  gradeColor: string;
};

function ClimbLabel({ display, labelColor, formattedGrade, gradeColor }: ClimbLabelProps) {
  return (
    <View style={styles.labelInner}>
      <Text variant="subheadline" color={labelColor} numberOfLines={1} ellipsizeMode="tail" style={styles.name}>
        {display.name ?? ''}
      </Text>
      {formattedGrade ? (
        <Text variant="headline" numberOfLines={1} style={[styles.gradeText, { color: gradeColor }]}>
          {formattedGrade}
        </Text>
      ) : null}
    </View>
  );
}

type ClimbCapsuleProps = {
  /**
   * Render without the capsule's own glass pill / border / shadow. Used inside
   * the iOS 26 tab-bar bottom accessory, which is itself a Liquid Glass platter —
   * a second glass surface there would read as glass-on-glass. Keeps the label
   * + swipe/tap gestures; just drops the background chrome.
   */
  bare?: boolean;
  /**
   * Let the capsule fill its parent. Used by the native bottom accessory where
   * UIKit's platter is wider than the standalone floating capsule cap.
   */
  fillWidth?: boolean;
  /** Optional right-side action rendered inside the capsule chrome. */
  endAction?: ReactNode;
  endActionSize?: number;
};

export function ClimbCapsule({ bare = false, fillWidth = false, endAction, endActionSize = 0 }: ClimbCapsuleProps) {
  const { state, nextClimb, previousClimb } = useQueue();
  const { openPlayDrawer } = useDrawerHost();
  const { systemColors } = useTheme();
  const { t } = useTranslation('session');
  const { formatGrade } = useGradeFormat();
  const reduceMotion = useReduceMotion();
  const nativeGlass = useNativeGlass();

  const [width, setWidth] = useState(0);

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
    boardWidth: width,
    enabled: width > 0,
    reduceMotion,
  });

  const handleOpenPlay = useCallback(() => {
    if (!currentClimbQueueItem?.climb) return;
    hapticLight();
    // Opening the drawer for the already-current climb; opting out of
    // setAsCurrent avoids duplicating it at the end of the queue.
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

  // Swipe up to open the drawer — a quick alternative to tapping (like dragging a
  // now-playing chip up to full screen). Activates only on upward movement and
  // bails on horizontal travel, so the prev/next carousel keeps the sideways
  // swipes. Opens on a decisive drag or a fast upward flick.
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

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  }, []);

  const currentLabelStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }] }));
  const nextPeekX = useDerivedValue(() =>
    computePeekOffset({ direction: 'next', swipeOffset: translateX.value, viewportWidth: width }),
  );
  const prevPeekX = useDerivedValue(() =>
    computePeekOffset({ direction: 'prev', swipeOffset: translateX.value, viewportWidth: width }),
  );
  const nextPeekStyle = useAnimatedStyle(() => ({ transform: [{ translateX: nextPeekX.value }] }));
  const prevPeekStyle = useAnimatedStyle(() => ({ transform: [{ translateX: prevPeekX.value }] }));

  const currentDisplay = climbDisplay(currentClimbQueueItem);
  const previousDisplay = climbDisplay(previousItem);
  const nextDisplay = climbDisplay(nextItem);

  if (!currentDisplay) return null;

  // Swipe is invisible to VoiceOver — expose prev/next as custom actions on the
  // capsule (rotor / two-finger swipe), gated on the same edge guards.
  const swipeAccessibilityActions = [
    ...(canPrevious ? [{ name: 'previous', label: t('mobile.queue.previousClimb') }] : []),
    ...(canNext ? [{ name: 'next', label: t('mobile.queue.nextClimb') }] : []),
  ];

  const currentFormatted = formatGrade(currentDisplay.difficulty);
  const previousFormatted = previousDisplay ? formatGrade(previousDisplay.difficulty) : null;
  const nextFormatted = nextDisplay ? formatGrade(nextDisplay.difficulty) : null;

  const currentGradeColor = getGradeColor(currentDisplay.difficulty) ?? DEFAULT_GRADE_COLOR;
  const previousGradeColor = previousDisplay
    ? (getGradeColor(previousDisplay.difficulty) ?? DEFAULT_GRADE_COLOR)
    : DEFAULT_GRADE_COLOR;
  const nextGradeColor = nextDisplay
    ? (getGradeColor(nextDisplay.difficulty) ?? DEFAULT_GRADE_COLOR)
    : DEFAULT_GRADE_COLOR;
  const endActionReservedWidth = endAction ? endActionSize + 8 : 0;
  const labelSlotRight = 16 + endActionReservedWidth;

  return (
    <View
      style={[
        styles.capsule,
        fillWidth ? styles.fillWidthCapsule : null,
        // Native Liquid Glass draws its own edge + lift; the hairline border and
        // shadow are only needed on the blur/solid fallback. `bare` (inside the
        // native accessory's own glass platter) drops all background chrome.
        !bare && !nativeGlass && shadows.sm,
        !bare && !nativeGlass && { borderWidth: StyleSheet.hairlineWidth, borderColor: systemColors.separator },
      ]}
    >
      {/* Neutral frosted glass — no grade-hued wash. The colorized grade text
          carries the grade; the capsule background stays a plain glass surface.
          Omitted in `bare` mode (the accessory platter is the glass). */}
      {bare ? null : (
        <GlassSurface
          glassEffectStyle="regular"
          fallbackColor={systemColors.elevatedSurface}
          borderRadius={CAPSULE_RADIUS}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      )}
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
          <Animated.View style={[styles.labelSlot, { right: labelSlotRight }, currentLabelStyle]}>
            <ClimbLabel
              display={currentDisplay}
              labelColor={systemColors.label}
              formattedGrade={currentFormatted}
              gradeColor={currentGradeColor}
            />
          </Animated.View>
          {nextDisplay ? (
            <Animated.View style={[styles.peekSlot, nextPeekStyle]} pointerEvents="none">
              <ClimbLabel
                display={nextDisplay}
                labelColor={systemColors.label}
                formattedGrade={nextFormatted}
                gradeColor={nextGradeColor}
              />
            </Animated.View>
          ) : null}
          {previousDisplay ? (
            <Animated.View style={[styles.peekSlot, prevPeekStyle]} pointerEvents="none">
              <ClimbLabel
                display={previousDisplay}
                labelColor={systemColors.label}
                formattedGrade={previousFormatted}
                gradeColor={previousGradeColor}
              />
            </Animated.View>
          ) : null}
        </View>
      </GestureDetector>
      {endAction ? (
        <View style={[styles.endActionSlot, { width: endActionSize, height: TOOLBAR_CAPSULE_HEIGHT }]}>
          {endAction}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  capsule: {
    flex: 1,
    maxWidth: TOOLBAR_CAPSULE_MAX_WIDTH,
    height: TOOLBAR_CAPSULE_HEIGHT,
    borderRadius: CAPSULE_RADIUS,
  },
  fillWidthCapsule: {
    width: '100%',
    maxWidth: '100%',
  },
  swipeArea: {
    flex: 1,
    height: TOOLBAR_CAPSULE_HEIGHT,
    borderRadius: CAPSULE_RADIUS,
    overflow: 'hidden',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  labelSlot: {
    position: 'absolute',
    left: 16,
    right: 16,
    justifyContent: 'center',
  },
  endActionSlot: {
    position: 'absolute',
    top: 0,
    right: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  peekSlot: {
    position: 'absolute',
    left: 16,
    right: 16,
    justifyContent: 'center',
  },
  labelInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  gradeText: {
    // Colorized like the list rows; right-aligned with a reserved min width
    // (tabular digits) so the grade column stays put as you swipe between climbs.
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
    minWidth: 40,
    textAlign: 'right',
  },
  name: {
    flex: 1,
    fontWeight: '600',
  },
});
