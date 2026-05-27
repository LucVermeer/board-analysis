import { useEffect } from 'react';
import { Pressable, StyleSheet } from 'react-native';
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
    disconnectedColor: systemColors.secondaryLabel as string,
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
        animatedStyle,
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
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
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
