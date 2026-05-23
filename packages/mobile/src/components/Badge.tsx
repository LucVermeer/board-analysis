import { View, StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Text } from './Text';

type BadgeProps = {
  count?: number;
  visible?: boolean;
  color?: string;
  size?: 'small' | 'medium';
};

export function Badge({ count, visible = true, color = '#FF3B30', size = 'medium' }: BadgeProps) {
  if (!visible) return null;

  const isDot = count === undefined || count === 0;
  const displayCount = count && count > 99 ? '99+' : String(count ?? '');

  const badgeSize = size === 'small' ? 8 : isDot ? 10 : 18;
  const minWidth = isDot ? badgeSize : Math.max(badgeSize, displayCount.length * 8 + 10);

  const accessibilityLabel = isDot ? undefined : `${displayCount}`;

  return (
    <Animated.View
      entering={FadeIn.springify().damping(15).stiffness(200)}
      exiting={FadeOut.duration(150)}
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.badge,
        {
          backgroundColor: color,
          height: badgeSize,
          minWidth,
          borderRadius: badgeSize / 2,
        },
      ]}
    >
      {!isDot && (
        <Text variant="caption2" color="#FFFFFF" style={styles.text}>
          {displayCount}
        </Text>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  text: {
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 13,
  },
});
