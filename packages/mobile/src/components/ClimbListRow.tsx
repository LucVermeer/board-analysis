import { Pressable, View, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Text } from './Text';
import { Icon } from './Icon';
import { hapticLight } from '../lib/haptics';
import { springs } from '../theme/animations';
import { DEFAULT_GRADE_COLOR } from '@boardsesh/board-constants';

type ClimbListRowProps = {
  climb: {
    uuid: string;
    name: string;
    setter_username: string;
    difficulty: string;
    quality_average: string;
    ascensionist_count: number;
    stars: number;
  };
  gradeName?: string;
  gradeColor?: string;
  onPress: () => void;
  onLongPress?: () => void;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function ClimbListRow({ climb, gradeName, gradeColor, onPress, onLongPress }: ClimbListRowProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.98, springs.snappy);
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, springs.snappy);
  };

  const handlePress = () => {
    hapticLight();
    onPress();
  };

  const pillColor = gradeColor ?? DEFAULT_GRADE_COLOR;
  const qualityNum = parseFloat(climb.quality_average);
  const showStars = climb.stars > 0 || qualityNum > 0;

  const accessibilityLabel = gradeName
    ? `${climb.name}, ${gradeName}`
    : `${climb.name}, ${climb.difficulty}`;

  return (
    <AnimatedPressable
      onPress={handlePress}
      onLongPress={onLongPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[animatedStyle, styles.container]}
    >
      <View style={styles.row}>
        <View style={styles.textContainer}>
          <Text variant="headline" numberOfLines={1}>
            {climb.name}
          </Text>
          <Text variant="footnote" numberOfLines={1} style={styles.setter}>
            {climb.setter_username}
          </Text>
        </View>

        <View style={styles.metadata}>
          {showStars && (
            <View style={styles.stars}>
              <Icon name="star.fill" size={12} color="#FFB800" />
              <Text variant="caption1" style={styles.starText}>
                {climb.stars > 0 ? climb.stars.toFixed(1) : qualityNum.toFixed(1)}
              </Text>
            </View>
          )}
          {climb.ascensionist_count > 0 && (
            <Text variant="footnote" style={styles.ascents}>
              {formatAscentCount(climb.ascensionist_count)}
            </Text>
          )}
          <View style={[styles.gradePill, { backgroundColor: pillColor }]}>
            <Text variant="caption2" color="#FFFFFF" style={styles.gradeText}>
              {gradeName ?? climb.difficulty}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.separator} />
    </AnimatedPressable>
  );
}

function formatAscentCount(count: number): string {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k`;
  }
  return String(count);
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'transparent',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 52,
  },
  textContainer: {
    flex: 1,
    justifyContent: 'center',
    marginRight: 12,
  },
  setter: {
    opacity: 0.6,
    marginTop: 2,
  },
  metadata: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stars: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  starText: {
    opacity: 0.7,
  },
  ascents: {
    opacity: 0.5,
  },
  gradePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    minWidth: 36,
    alignItems: 'center',
  },
  gradeText: {
    fontWeight: '600',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(60, 60, 67, 0.29)',
    marginLeft: 16,
  },
});
