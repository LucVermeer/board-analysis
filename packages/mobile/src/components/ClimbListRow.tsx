import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Pressable, View, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, runOnJS, type SharedValue } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { useTranslation } from 'react-i18next';
import type { Climb, BoardName } from '@boardsesh/shared-schema';
import { getGradeColor, DEFAULT_GRADE_COLOR } from '@boardsesh/board-constants/grade-colors';
import { Text } from './Text';
import { Icon } from './Icon';
import { ClimbListThumbnail, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT } from './ClimbListThumbnail';
import { AscentStatusBadge } from './AscentStatusBadge';
import { hapticLight, hapticMedium, hapticSuccess } from '../lib/haptics';
import { formatSends, formatQuality } from '../lib/format-climb-stats';
import { useGradeFormat } from '../hooks/use-grade-format';
import { useTheme } from '../providers/theme-provider';
import { iosSystemColors } from '../theme/ios-colors';
import { brandColors } from '../theme/colors';
import { spacing } from '../theme/tokens';

// Width the trailing +Queue panel reveals to. Reveal-and-hold: the panel rests
// open after the swipe and the user taps the revealed + to commit. Tunable.
const RIGHT_ACTION_REVEAL = 96;

type ClimbListRowProps = {
  climb: Climb;
  boardName: BoardName;
  layoutId: number;
  sizeId: number;
  setIds: string;
  angle: number;
  onPress: (climb: Climb) => void;
  onAddToQueue?: (climb: Climb) => void;
  onOpenActions?: (climb: Climb) => void;
  selected?: boolean;
  unsupported?: boolean;
};

/**
 * Trailing "+ Queue" swipe action (reveal-and-hold). Swiping the row left
 * reveals the sage panel, which rests open so the user can tap the + to add
 * the climb to the queue; the icon fades in with the drag. Rendered by
 * ReanimatedSwipeable's renderRightActions so it gets the live drag value.
 */
function QueueSwipeAction({ translation, onCommit }: { translation: SharedValue<number>; onCommit: () => void }) {
  const iconStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.abs(translation.value) / (RIGHT_ACTION_REVEAL * 0.6)),
  }));

  return (
    <Pressable style={styles.rightAction} onPress={onCommit}>
      <Animated.View style={iconStyle}>
        <Icon name="add" size={22} color={iosSystemColors.white} />
      </Animated.View>
    </Pressable>
  );
}

const ClimbListRow = React.memo(function ClimbListRow({
  climb,
  boardName,
  layoutId,
  sizeId,
  setIds,
  angle,
  onPress,
  onAddToQueue,
  onOpenActions,
  selected,
  unsupported,
}: ClimbListRowProps) {
  const { t } = useTranslation('climbs');
  const { systemColors } = useTheme();
  const { formatGrade } = useGradeFormat();

  const gradeColor = getGradeColor(climb.difficulty) ?? DEFAULT_GRADE_COLOR;
  const formattedGrade = formatGrade(climb.difficulty);

  const swipeableRef = useRef<SwipeableMethods>(null);

  // FlashList recycles rows (same instance, new climb). Snap any open swipe
  // shut so a recycled row never shows the previous climb's open +Queue panel.
  // reset() (vs close()) skips the animation — an animated slide-shut on a
  // recycle would read as a glitch. The reset lands on the next UI frame, so a
  // row recycled while open can flash its panel for ~1 frame; the opaque
  // contentRow background occludes the panel once translation returns to 0, so
  // that background must stay opaque.
  useEffect(() => {
    swipeableRef.current?.reset();
  }, [climb.uuid]);

  // Stable refs so gesture/worklet callbacks never close over stale props.
  const onPressRef = useRef(onPress);
  onPressRef.current = onPress;
  const onAddToQueueRef = useRef(onAddToQueue);
  onAddToQueueRef.current = onAddToQueue;
  const onOpenActionsRef = useRef(onOpenActions);
  onOpenActionsRef.current = onOpenActions;
  const climbRef = useRef(climb);
  climbRef.current = climb;
  const unsupportedRef = useRef(unsupported);
  unsupportedRef.current = unsupported;

  const handleRowPress = useCallback(() => {
    if (unsupportedRef.current) return;
    hapticLight();
    onPressRef.current(climbRef.current);
  }, []);

  const handleLongPress = useCallback(() => {
    if (unsupportedRef.current) return;
    hapticMedium();
    onOpenActionsRef.current?.(climbRef.current);
  }, []);

  const handleAddToQueue = useCallback(() => {
    hapticSuccess();
    onAddToQueueRef.current?.(climbRef.current);
    swipeableRef.current?.close();
  }, []);

  const singleTapGesture = useMemo(
    () =>
      Gesture.Tap()
        .maxDuration(300)
        .maxDistance(15)
        .onStart(() => {
          'worklet';
          runOnJS(handleRowPress)();
        }),
    [handleRowPress],
  );

  const longPressGesture = useMemo(
    () =>
      Gesture.LongPress()
        .minDuration(400)
        .onStart(() => {
          'worklet';
          runOnJS(handleLongPress)();
        }),
    [handleLongPress],
  );

  // Long-press wins over tap; a quick tap fires once the long-press fails.
  const tapGesture = useMemo(
    () => Gesture.Exclusive(longPressGesture, singleTapGesture),
    [longPressGesture, singleTapGesture],
  );

  const renderRightActions = useCallback(
    (_progress: SharedValue<number>, translation: SharedValue<number>) => (
      <QueueSwipeAction translation={translation} onCommit={handleAddToQueue} />
    ),
    [handleAddToQueue],
  );

  // Subtitle parts: sends · quality★ · setter (each dropped when absent).
  const subtitleText = useMemo(() => {
    const parts: string[] = [];
    if (climb.is_draft) {
      parts.push(t('createClimbForm.draftBadge'));
    }
    if (!climb.is_draft && climb.ascensionist_count) {
      parts.push(formatSends(climb.ascensionist_count));
    }
    const qualityNum = parseFloat(climb.quality_average);
    if (qualityNum > 0) {
      parts.push(`${formatQuality(climb.quality_average)}★`);
    }
    if (climb.setter_username) {
      parts.push(climb.setter_username);
    }
    return parts.length > 0 ? parts.join(' · ') : t('mobile.climbRow.projectFallback');
  }, [climb.is_draft, climb.ascensionist_count, climb.quality_average, climb.setter_username, t]);

  return (
    <View style={[styles.outerContainer, unsupported && styles.unsupported]}>
      <ReanimatedSwipeable ref={swipeableRef} friction={2} rightThreshold={40} renderRightActions={renderRightActions}>
        <GestureDetector gesture={tapGesture}>
          <View
            style={[styles.contentRow, { backgroundColor: systemColors.background }]}
            accessible
            accessibilityRole="button"
            accessibilityLabel={climb.name}
            accessibilityState={{ selected: !!selected }}
          >
            {/* Active-climb highlight: rose wash + left accent bar */}
            {selected ? <View style={styles.selectedFill} pointerEvents="none" /> : null}
            {selected ? <View style={styles.selectedAccent} pointerEvents="none" /> : null}

            {/* Left: portrait thumbnail with ascent badge */}
            <View style={styles.thumbnailContainer}>
              <ClimbListThumbnail
                frames={climb.frames}
                boardName={boardName}
                layoutId={layoutId}
                sizeId={sizeId}
                setIds={setIds}
                mirrored={climb.mirrored ?? false}
              />
              <AscentStatusBadge climbUuid={climb.uuid} angle={angle} />
            </View>

            {/* Center: name + subtitle */}
            <View style={styles.centerColumn}>
              <Text variant="body" numberOfLines={1} style={styles.climbName}>
                {climb.name}
              </Text>
              <Text variant="footnote" numberOfLines={1} style={styles.subtitle}>
                {subtitleText}
              </Text>
            </View>

            {/* Right: colorized grade */}
            <View style={styles.rightSection}>
              <Text variant="headline" numberOfLines={1} style={[styles.gradeText, { color: gradeColor }]}>
                {formattedGrade ?? climb.difficulty}
              </Text>
            </View>
          </View>
        </GestureDetector>
      </ReanimatedSwipeable>

      {/* Separator — inset to start at the text column (after the thumbnail) */}
      <View style={[styles.separator, { backgroundColor: systemColors.separator }]} />
    </View>
  );
});

export { ClimbListRow };

const styles = StyleSheet.create({
  outerContainer: {
    position: 'relative',
    overflow: 'hidden',
  },
  unsupported: {
    opacity: 0.5,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[2],
    gap: spacing[3],
  },
  // Active-climb wash. Brand rose (#8C4A52) at low alpha — kept distinct from
  // the grade colour on the right of the row. Behind the content (crisp text).
  selectedFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(140, 74, 82, 0.14)',
  },
  selectedAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: brandColors.primary,
  },
  thumbnailContainer: {
    width: THUMBNAIL_WIDTH,
    height: THUMBNAIL_HEIGHT,
    flexShrink: 0,
    position: 'relative',
  },
  centerColumn: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    gap: 2,
  },
  climbName: {
    fontWeight: '600',
  },
  subtitle: {
    opacity: 0.6,
  },
  rightSection: {
    flexShrink: 0,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  gradeText: {
    fontWeight: '700',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: THUMBNAIL_WIDTH + spacing[2] + spacing[3],
  },
  rightAction: {
    width: RIGHT_ACTION_REVEAL,
    backgroundColor: brandColors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
