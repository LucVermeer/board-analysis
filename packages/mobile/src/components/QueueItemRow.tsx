import { Pressable, View, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector, type GestureUpdateEvent, type PanGestureHandlerEventPayload } from 'react-native-gesture-handler';
import type { ClimbQueueItem } from '@boardsesh/queue';
import { Text } from './Text';
import { Icon } from './Icon';
import { brandColors } from '../theme/colors';
import { hapticSelection, hapticMedium } from '../lib/haptics';

const SWIPE_DELETE_THRESHOLD = -80;
const DELETE_BUTTON_WIDTH = 80;

type QueueItemRowProps = {
  item: ClimbQueueItem;
  position: number;
  isCurrentClimb: boolean;
  onPress: () => void;
  onRemove: () => void;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function QueueItemRow({ item, position, isCurrentClimb, onPress, onRemove }: QueueItemRowProps) {
  const translateX = useSharedValue(0);
  const rowOpacity = useSharedValue(1);
  const rowHeight = useSharedValue<number | undefined>(undefined);
  const isSwipeOpen = useSharedValue(false);

  const handleRemove = () => {
    hapticMedium();
    onRemove();
  };

  const panGesture = Gesture.Pan()
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
      } else {
        // Snap back
        translateX.value = withSpring(0, { damping: 20, stiffness: 200 });
        isSwipeOpen.value = false;
      }
    });

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
    if (isSwipeOpen.value) {
      // Close the swipe first
      translateX.value = withSpring(0, { damping: 20, stiffness: 200 });
      isSwipeOpen.value = false;
      return;
    }
    hapticSelection();
    onPress();
  };

  const handleDeletePress = () => {
    // Animate the row out
    translateX.value = withTiming(-400, { duration: 200 });
    rowOpacity.value = withTiming(0, { duration: 200 });
    rowHeight.value = withTiming(0, { duration: 200 }, () => {
      runOnJS(handleRemove)();
    });
  };

  const climbName = item.climb?.name ?? 'Unknown climb';
  const difficulty = item.climb?.difficulty ?? '';

  return (
    <Animated.View style={containerAnimatedStyle}>
      <View style={styles.swipeContainer}>
        {/* Delete action behind the row */}
        <Animated.View style={[styles.deleteAction, deleteButtonStyle]}>
          <Pressable onPress={handleDeletePress} style={styles.deleteButton}>
            <Icon name="delete" size={22} color="#FFFFFF" />
          </Pressable>
        </Animated.View>

        <GestureDetector gesture={panGesture}>
          <AnimatedPressable
            onPress={handlePress}
            style={[
              styles.row,
              isCurrentClimb && styles.currentClimbRow,
              rowAnimatedStyle,
            ]}
          >
            {/* Position number */}
            <View style={styles.positionContainer}>
              {isCurrentClimb ? (
                <Icon name="play.fill" size={14} color={brandColors.primary} />
              ) : (
                <Text variant="subheadline" color="#8E8E93" style={styles.positionText}>
                  {String(position)}
                </Text>
              )}
            </View>

            {/* Climb info */}
            <View style={styles.climbInfo}>
              <Text
                variant="body"
                numberOfLines={1}
                style={isCurrentClimb ? styles.currentClimbText : undefined}
              >
                {climbName}
              </Text>
              {item.addedByUser?.username ? (
                <Text variant="caption1" color="#8E8E93" numberOfLines={1}>
                  {item.addedByUser.username}
                </Text>
              ) : null}
            </View>

            {/* Grade pill */}
            {difficulty ? (
              <View style={[styles.gradePill, isCurrentClimb && styles.currentGradePill]}>
                <Text
                  variant="caption1"
                  color={isCurrentClimb ? brandColors.primary : '#8E8E93'}
                  style={styles.gradeText}
                >
                  {difficulty}
                </Text>
              </View>
            ) : null}
          </AnimatedPressable>
        </GestureDetector>
      </View>

      {/* Separator */}
      <View style={[styles.separator, { marginLeft: 52 }]} />
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
    backgroundColor: 'rgba(140, 74, 82, 0.08)',
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
    backgroundColor: 'rgba(142, 142, 147, 0.12)',
    marginLeft: 8,
  },
  currentGradePill: {
    backgroundColor: 'rgba(140, 74, 82, 0.12)',
  },
  gradeText: {
    fontWeight: '600',
  },
  deleteAction: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#FF3B30',
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
    backgroundColor: 'rgba(60, 60, 67, 0.29)',
  },
});
