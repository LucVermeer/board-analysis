import { Pressable, StyleSheet, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Text } from './Text';
import { Icon } from './Icon';
import type { IconName } from './icon-map';
import { hapticLight } from '../lib/haptics';
import { springs } from '../theme/animations';
import { brandColors } from '../theme/colors';

type ButtonVariant = 'filled' | 'outlined' | 'text';
type ButtonSize = 'small' | 'medium' | 'large';

type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  haptic?: boolean;
  tintColor?: string;
  style?: ViewStyle;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const sizeConfig = {
  small: { paddingHorizontal: 12, paddingVertical: 6, fontSize: 14, iconSize: 16 },
  medium: { paddingHorizontal: 16, paddingVertical: 10, fontSize: 16, iconSize: 20 },
  large: { paddingHorizontal: 20, paddingVertical: 14, fontSize: 17, iconSize: 22 },
} as const;

export function Button({
  title,
  onPress,
  variant = 'filled',
  size = 'medium',
  icon,
  disabled = false,
  loading = false,
  haptic = true,
  tintColor = brandColors.primary,
  style,
}: ButtonProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const config = sizeConfig[size];

  const handlePress = () => {
    if (disabled || loading) return;
    if (haptic) hapticLight();
    onPress();
  };

  const handlePressIn = () => {
    scale.value = withSpring(0.96, springs.snappy);
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, springs.snappy);
  };

  const containerStyle: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: config.paddingHorizontal,
    paddingVertical: config.paddingVertical,
    borderRadius: 10,
    opacity: disabled ? 0.5 : 1,
    ...(variant === 'filled' && { backgroundColor: tintColor }),
    ...(variant === 'outlined' && { borderWidth: 1, borderColor: tintColor }),
  };

  const textColor =
    variant === 'filled' ? '#FFFFFF' : tintColor;

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading }}
      accessibilityLabel={title}
      style={[animatedStyle, containerStyle, style]}
    >
      {icon && <Icon name={icon} size={config.iconSize} color={textColor} />}
      <Text
        variant={size === 'small' ? 'footnote' : size === 'large' ? 'body' : 'callout'}
        color={textColor}
        style={styles.label}
      >
        {loading ? '...' : title}
      </Text>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  label: { fontWeight: '600' },
});
