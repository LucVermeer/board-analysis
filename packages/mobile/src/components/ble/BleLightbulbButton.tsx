import { useEffect } from 'react';
import { Pressable, StyleSheet, type ColorValue } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Icon } from '../Icon';
import { hapticLight, hapticMedium } from '../../lib/haptics';
import { useTheme } from '../../providers/theme-provider';
import { timing } from '../../theme/animations';
import { getBleLightbulbAccessibilityHint, getBleLightbulbVisualState } from './ble-lightbulb-button-state';

type BleLightbulbButtonProps = {
  isConnected: boolean;
  isScanning: boolean;
  onPress: () => void;
  accessibilityLabel: string;
  scanningAccessibilityHint?: string;
  haptic?: 'light' | 'medium' | 'none';
  size?: number;
  /**
   * Width/height of the pressable container in pixels. Defaults to 44 (iOS HIG
   * minimum tap target). Used to render a larger 56-pt variant inside the play
   * drawer's primary action row.
   */
  containerSize?: number;
  /**
   * Tonal fill for the at-rest (disconnected) state so the button reads as a
   * pressable target rather than a bare glyph. Set by the queue bar (passes
   * `systemColors.fill`) to match the neighbouring Tick; the play drawer omits it
   * to keep its own bare-icon look. The connected state keeps its own warm fill.
   */
  restingBackgroundColor?: ColorValue;
  /** Icon colour in the disconnected (resting) state. Defaults to secondaryLabel;
   *  the queue bar passes white for a crisp Spotify-style glyph. */
  disconnectedColor?: string;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function BleLightbulbButton({
  isConnected,
  isScanning,
  onPress,
  accessibilityLabel,
  scanningAccessibilityHint,
  haptic = 'light',
  size = 24,
  containerSize = 44,
  restingBackgroundColor,
  disconnectedColor,
}: BleLightbulbButtonProps) {
  const { systemColors, brandColors } = useTheme();
  const pulseOpacity = useSharedValue(1);

  useEffect(() => {
    if (isScanning) {
      pulseOpacity.value = withRepeat(withTiming(0.35, { duration: timing.slow }), -1, true);
    } else {
      cancelAnimation(pulseOpacity);
      pulseOpacity.value = withTiming(1, { duration: timing.fast });
    }
  }, [isScanning, pulseOpacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
  }));

  const handlePress = () => {
    if (haptic === 'light') {
      hapticLight();
    } else if (haptic === 'medium') {
      hapticMedium();
    }
    onPress();
  };

  const visualState = getBleLightbulbVisualState({
    isConnected,
    connectedColor: brandColors.warning,
    disconnectedColor: disconnectedColor ?? (systemColors.secondaryLabel as string),
  });

  return (
    <AnimatedPressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={getBleLightbulbAccessibilityHint(isScanning, scanningAccessibilityHint)}
      accessibilityState={{ selected: isConnected }}
      hitSlop={8}
      style={({ pressed }) => [
        styles.container,
        { width: containerSize, height: containerSize, borderRadius: containerSize / 2 },
        animatedStyle,
        !isConnected &&
          restingBackgroundColor != null && {
            backgroundColor: restingBackgroundColor,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: systemColors.separator as string,
          },
        isConnected && {
          backgroundColor: visualState.backgroundColor,
          shadowColor: visualState.shadowColor,
        },
        isConnected && styles.connected,
        pressed && styles.pressed,
      ]}
    >
      <Icon name={visualState.iconName} size={size} color={visualState.iconColor} />
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  connected: {
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 2,
  },
  pressed: {
    opacity: 0.6,
    transform: [{ scale: 0.92 }],
  },
});
