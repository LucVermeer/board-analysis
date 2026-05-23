import { type ReactNode } from 'react';
import { Pressable, View, StyleSheet, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Text } from './Text';
import { Icon } from './Icon';
import { hapticLight } from '../lib/haptics';
import { springs } from '../theme/animations';

type ListRowProps = {
  title: string;
  subtitle?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  showChevron?: boolean;
  onPress?: () => void;
  haptic?: boolean;
  showSeparator?: boolean;
  separatorInset?: number;
  style?: ViewStyle;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function ListRow({
  title,
  subtitle,
  leading,
  trailing,
  showChevron = false,
  onPress,
  haptic = true,
  showSeparator = true,
  separatorInset = 16,
  style,
}: ListRowProps) {
  const opacity = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const handlePressIn = () => {
    opacity.value = withSpring(0.7, springs.snappy);
  };

  const handlePressOut = () => {
    opacity.value = withSpring(1, springs.snappy);
  };

  const handlePress = () => {
    if (haptic) hapticLight();
    onPress?.();
  };

  const content = (
    <>
      <View style={styles.row}>
        {leading && <View style={styles.leading}>{leading}</View>}
        <View style={styles.textContainer}>
          <Text variant="body" numberOfLines={1}>
            {title}
          </Text>
          {subtitle && (
            <Text variant="subheadline" style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          )}
        </View>
        {trailing && <View style={styles.trailing}>{trailing}</View>}
        {showChevron && (
          <View style={styles.chevron}>
            <Icon name="chevron.right" size={14} color="#C7C7CC" />
          </View>
        )}
      </View>
      {showSeparator && (
        <View style={[styles.separator, { marginLeft: separatorInset + (leading ? 48 : 0) }]} />
      )}
    </>
  );

  if (onPress) {
    return (
      <AnimatedPressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        accessibilityRole="button"
        accessibilityLabel={title}
        style={[animatedStyle, styles.container, style]}
      >
        {content}
      </AnimatedPressable>
    );
  }

  return <View style={[styles.container, style]}>{content}</View>;
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
    minHeight: 44,
  },
  leading: {
    marginRight: 12,
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  subtitle: {
    opacity: 0.6,
    marginTop: 2,
  },
  trailing: {
    marginLeft: 8,
  },
  chevron: {
    marginLeft: 4,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(60, 60, 67, 0.29)',
  },
});
