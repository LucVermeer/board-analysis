// The toolbar's center element: a floating pill showing the current climb's name
// with the grade colorized on the right — the same treatment as the climb list
// rows. Tap opens the PlayDrawer; horizontal swipe steps the queue (prev/next)
// with the neighbouring climb peeking in. The pill's background adapts to the UI
// variant (Liquid Glass / Material / fallback) via AccessoryBarSurface; the
// swipe/peek/tap behaviour is shared with the native accessory via useQueueCarousel.

import { useMemo } from 'react';
import { View, StyleSheet, type ColorValue } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';
import { getGradeColor, DEFAULT_GRADE_COLOR } from '@boardsesh/board-constants/grade-colors';
import type { ClimbQueueItem } from '@boardsesh/queue';
import { TOOLBAR_CAPSULE_HEIGHT, TOOLBAR_CAPSULE_MAX_WIDTH } from '../../theme/layout';
import { CHROME_LABEL_MAX_FONT_SCALE } from '../../theme/typography';
import { useGradeFormat } from '../../hooks/use-grade-format';
import { Text } from '../Text';
import { useTheme } from '../../providers/theme-provider';
import { AccessoryBarSurface } from './AccessoryBarSurface';
import { useQueueCarousel } from './use-queue-carousel';

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
      <Text
        variant="subheadline"
        color={labelColor}
        numberOfLines={1}
        ellipsizeMode="tail"
        maxFontSizeMultiplier={CHROME_LABEL_MAX_FONT_SCALE}
        style={styles.name}
      >
        {display.name ?? ''}
      </Text>
      {formattedGrade ? (
        <Text
          variant="headline"
          numberOfLines={1}
          maxFontSizeMultiplier={CHROME_LABEL_MAX_FONT_SCALE}
          style={[styles.gradeText, { color: gradeColor }]}
        >
          {formattedGrade}
        </Text>
      ) : null}
    </View>
  );
}

type ClimbCapsuleProps = {
  height?: number;
};

export function ClimbCapsule({ height = TOOLBAR_CAPSULE_HEIGHT }: ClimbCapsuleProps) {
  const { systemColors } = useTheme();
  const { formatGrade } = useGradeFormat();
  const {
    onLayout,
    composedGesture,
    currentLabelStyle,
    nextPeekStyle,
    prevPeekStyle,
    currentItem,
    previousItem,
    nextItem,
    handleNext,
    handlePrevious,
    swipeAccessibilityActions,
  } = useQueueCarousel();

  const currentDisplay = climbDisplay(currentItem);
  const previousDisplay = climbDisplay(previousItem);
  const nextDisplay = climbDisplay(nextItem);

  const grades = useMemo(() => {
    const color = (display: ClimbDisplay | null) =>
      display ? (getGradeColor(display.difficulty) ?? DEFAULT_GRADE_COLOR) : DEFAULT_GRADE_COLOR;
    return {
      current: currentDisplay ? formatGrade(currentDisplay.difficulty) : null,
      previous: previousDisplay ? formatGrade(previousDisplay.difficulty) : null,
      next: nextDisplay ? formatGrade(nextDisplay.difficulty) : null,
      currentColor: color(currentDisplay),
      previousColor: color(previousDisplay),
      nextColor: color(nextDisplay),
    };
  }, [currentDisplay, previousDisplay, nextDisplay, formatGrade]);

  if (!currentDisplay) return null;

  const capsuleRadius = height / 2;

  return (
    <AccessoryBarSurface height={height} borderRadius={capsuleRadius} style={styles.capsule}>
      <GestureDetector gesture={composedGesture}>
        <View
          style={[styles.swipeArea, { height, borderRadius: capsuleRadius }]}
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
              formattedGrade={grades.current}
              gradeColor={grades.currentColor}
            />
          </Animated.View>
          {nextDisplay ? (
            <Animated.View style={[styles.peekSlot, nextPeekStyle]} pointerEvents="none">
              <ClimbLabel
                display={nextDisplay}
                labelColor={systemColors.label}
                formattedGrade={grades.next}
                gradeColor={grades.nextColor}
              />
            </Animated.View>
          ) : null}
          {previousDisplay ? (
            <Animated.View style={[styles.peekSlot, prevPeekStyle]} pointerEvents="none">
              <ClimbLabel
                display={previousDisplay}
                labelColor={systemColors.label}
                formattedGrade={grades.previous}
                gradeColor={grades.previousColor}
              />
            </Animated.View>
          ) : null}
        </View>
      </GestureDetector>
    </AccessoryBarSurface>
  );
}

const styles = StyleSheet.create({
  capsule: {
    flex: 1,
    maxWidth: TOOLBAR_CAPSULE_MAX_WIDTH,
  },
  swipeArea: {
    flex: 1,
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
