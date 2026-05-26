import { useState, useMemo, useCallback, useEffect } from 'react';
import { Pressable, View, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming, runOnJS } from 'react-native-reanimated';
import {
  Gesture,
  GestureDetector,
  type GestureUpdateEvent,
  type PanGestureHandlerEventPayload,
} from 'react-native-gesture-handler';
import { useTranslation } from 'react-i18next';
import type { ClimbQueueItem } from '@boardsesh/queue';
import { Text } from './Text';
import { Icon } from './Icon';
import { brandColors } from '../theme/colors';
import { iosSystemColors } from '../theme/ios-colors';
import { useTheme } from '../providers/theme-provider';
import { useGradeFormat } from '../hooks/use-grade-format';
import { hapticSelection, hapticMedium } from '../lib/haptics';

const SWIPE_DELETE_THRESHOLD = -80;
const DELETE_BUTTON_WIDTH = 80;

type QueueItemRowProps = {
  item: ClimbQueueItem;
  position: number;
  isCurrentClimb: boolean;
  onPress: (item: ClimbQueueItem) => void;
  onRemove: (uuid: string) => void;
  isEditMode?: boolean;
  isSelected?: boolean;
  isHistoryItem?: boolean;
  onToggleSelect?: (uuid: string) => void;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function PositionIndicator({
  isEditMode,
  isSelected,
  isCurrentClimb,
  position,
}: {
  isEditMode: boolean;
  isSelected: boolean;
  isCurrentClimb: boolean;
  position: number;
}) {
  if (isEditMode) {
    return (
      <Icon
        name={isSelected ? 'checkmark.circle.fill' : 'circle'}
        size={22}
        color={isSelected ? brandColors.primary : iosSystemColors.systemGray4}
      />
    );
  }

  if (isCurrentClimb) {
    return <Icon name="play.fill" size={14} color={brandColors.primary} />;
  }

  return (
    <Text variant="subheadline" color={iosSystemColors.systemGray} style={styles.positionText}>
      {String(position)}
    </Text>
  );
}

export function QueueItemRow({
  item,
  position,
  isCurrentClimb,
  onPress,
  onRemove,
  isEditMode = false,
  isSelected = false,
  isHistoryItem = false,
  onToggleSelect,
}: QueueItemRowProps) {
  const { systemColors } = useTheme();
  const { t } = useTranslation('session');
  const translateX = useSharedValue(0);
  const rowOpacity = useSharedValue(1);
  const rowHeight = useSharedValue<number | undefined>(undefined);
  const isSwipeOpen = useSharedValue(false);
  const [isOpen, setIsOpen] = useState(false);

  // Disable swipe for edit mode and history items
  const swipeEnabled = !isEditMode && !isHistoryItem;

  // Reset swipe position when swipe gets disabled (e.g. entering edit mode)
  useEffect(() => {
    if (!swipeEnabled) {
      translateX.value = withSpring(0, { damping: 20, stiffness: 200 });
      isSwipeOpen.value = false;
      runOnJS(setIsOpen)(false);
    }
  }, [swipeEnabled]);

  const handleRemove = useCallback(() => {
    hapticMedium();
    onRemove(item.uuid);
  }, [item.uuid, onRemove]);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(swipeEnabled)
        .activeOffsetX([-10, 10])
        .failOffsetY([-5, 5])
        .onUpdate((event: GestureUpdateEvent<PanGestureHandlerEventPayload>) => {
          // Only allow swiping left
          if (event.translationX > 0) {
            translateX.value = 0;
            return;
          }
          translateX.value = Math.max(event.translationX, -DELETE_BUTTON_WIDTH - 20);
        })
        .onEnd(() => {
          if (translateX.value < SWIPE_DELETE_THRESHOLD) {
            // Snap open to show delete button
            translateX.value = withSpring(-DELETE_BUTTON_WIDTH, {
              damping: 20,
              stiffness: 200,
            });
            isSwipeOpen.value = true;
            runOnJS(setIsOpen)(true);
          } else {
            // Snap back
            translateX.value = withSpring(0, { damping: 20, stiffness: 200 });
            isSwipeOpen.value = false;
            runOnJS(setIsOpen)(false);
          }
        }),
    [swipeEnabled],
  );

  const rowAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const deleteButtonStyle = useAnimatedStyle(() => {
    const width = Math.min(Math.abs(translateX.value), DELETE_BUTTON_WIDTH);
    return {
      width,
      opacity: width / DELETE_BUTTON_WIDTH,
    };
  });

  const containerAnimatedStyle = useAnimatedStyle(() => ({
    opacity: rowOpacity.value,
    height: rowHeight.value,
    overflow: 'hidden' as const,
  }));

  const handlePress = () => {
    if (isEditMode) {
      hapticSelection();
      onToggleSelect?.(item.uuid);
      return;
    }
    if (isOpen) {
      // Close the swipe first
      translateX.value = withSpring(0, { damping: 20, stiffness: 200 });
      isSwipeOpen.value = false;
      setIsOpen(false);
      return;
    }
    hapticSelection();
    onPress(item);
  };

  const handleDeletePress = () => {
    // Animate the row out
    translateX.value = withTiming(-400, { duration: 200 });
    rowOpacity.value = withTiming(0, { duration: 200 });
    rowHeight.value = withTiming(0, { duration: 200 }, () => {
      runOnJS(handleRemove)();
    });
  };

  const { formatGrade } = useGradeFormat();
  const climbName = item.climb?.name ?? t('mobile.queue.unknownClimb');
  const rawDifficulty = item.climb?.difficulty ?? '';
  const difficulty = formatGrade(rawDifficulty) ?? rawDifficulty;

  const rowContent = (
    <AnimatedPressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`${climbName}, ${t('mobile.queue.positionLabel', { position })}`}
      accessibilityState={{ selected: isEditMode ? isSelected : isCurrentClimb }}
      style={[
        styles.row,
        isCurrentClimb && !isHistoryItem && styles.currentClimbRow,
        isHistoryItem && styles.historyRow,
        rowAnimatedStyle,
      ]}
    >
      {/* Position number or checkbox */}
      <View style={styles.positionContainer}>
        <PositionIndicator
          isEditMode={isEditMode}
          isSelected={isSelected}
          isCurrentClimb={isCurrentClimb}
          position={position}
        />
      </View>

      {/* Climb info */}
      <View style={styles.climbInfo}>
        <Text
          variant="body"
          numberOfLines={1}
          style={isCurrentClimb && !isHistoryItem ? styles.currentClimbText : undefined}
        >
          {climbName}
        </Text>
      </View>

      {/* Grade pill */}
      {difficulty ? (
        <View style={[styles.gradePill, isCurrentClimb && !isHistoryItem && styles.currentGradePill]}>
          <Text
            variant="caption1"
            color={isCurrentClimb && !isHistoryItem ? brandColors.primary : iosSystemColors.systemGray}
            style={styles.gradeText}
          >
            {difficulty}
          </Text>
        </View>
      ) : null}
    </AnimatedPressable>
  );

  return (
    <Animated.View style={containerAnimatedStyle}>
      <View style={styles.swipeContainer}>
        {/* Delete action behind the row */}
        {swipeEnabled && (
          <Animated.View style={[styles.deleteAction, deleteButtonStyle]}>
            <Pressable
              onPress={handleDeletePress}
              accessibilityRole="button"
              accessibilityLabel={t('mobile.queue.removeClimb')}
              style={styles.deleteButton}
            >
              <Icon name="delete" size={22} color={iosSystemColors.white} />
            </Pressable>
          </Animated.View>
        )}

        {swipeEnabled ? <GestureDetector gesture={panGesture}>{rowContent}</GestureDetector> : rowContent}
      </View>

      {/* Separator */}
      <View style={[styles.separator, { marginLeft: 52, backgroundColor: systemColors.separator }]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  swipeContainer: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    minHeight: 52,
    backgroundColor: 'transparent',
  },
  currentClimbRow: {
    backgroundColor: `${brandColors.primary}14`,
  },
  historyRow: {
    opacity: 0.5,
  },
  positionContainer: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  positionText: {
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  climbInfo: {
    flex: 1,
    justifyContent: 'center',
    gap: 2,
  },
  currentClimbText: {
    fontWeight: '600',
  },
  gradePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: `${iosSystemColors.systemGray}1F`,
    marginLeft: 8,
  },
  currentGradePill: {
    backgroundColor: `${brandColors.primary}1F`,
  },
  gradeText: {
    fontWeight: '600',
  },
  deleteAction: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: iosSystemColors.systemRed,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteButton: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
  },
});
