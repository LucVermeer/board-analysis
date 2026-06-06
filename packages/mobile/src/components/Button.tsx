import { StyleSheet, type ViewStyle } from 'react-native';
import { Text } from './Text';
import { Icon } from './Icon';
import { PressableSurface } from './PressableSurface';
import type { IconName } from './icon-map';
import { hapticLight } from '../lib/haptics';
import { brandColors } from '../theme/colors';
import { iosSystemColors } from '../theme/ios-colors';
import { useTheme } from '../providers/theme-provider';

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
  const config = sizeConfig[size];
  // Soft 10dp corner on Liquid Glass, M3 20dp on Material (and Android, which
  // defaults to the Material variant).
  const { radii } = useTheme();

  const handlePress = () => {
    if (disabled || loading) return;
    if (haptic) hapticLight();
    onPress();
  };

  const containerStyle: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: config.paddingHorizontal,
    paddingVertical: config.paddingVertical,
    borderRadius: radii.button,
    opacity: disabled ? 0.5 : 1,
    ...(variant === 'filled' && { backgroundColor: tintColor }),
    ...(variant === 'outlined' && { borderWidth: 1, borderColor: tintColor }),
  };

  const textColor = variant === 'filled' ? iosSystemColors.white : tintColor;
  // M3 ripple: onPrimary (white) over a filled button, the tint over outlined/text.
  const rippleColor = variant === 'filled' ? iosSystemColors.white : tintColor;

  return (
    <PressableSurface
      onPress={handlePress}
      feedback="scale"
      scaleTo={0.96}
      rippleColor={rippleColor}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading }}
      accessibilityLabel={title}
      style={[containerStyle, style]}
    >
      {icon && <Icon name={icon} size={config.iconSize} color={textColor} />}
      <Text
        variant={size === 'small' ? 'footnote' : size === 'large' ? 'body' : 'callout'}
        color={textColor}
        style={styles.label}
      >
        {loading ? '...' : title}
      </Text>
    </PressableSurface>
  );
}

const styles = StyleSheet.create({
  label: { fontWeight: '600' },
});
