import { useEffect } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated';
import { Icon } from '../Icon';
import { useTheme } from '../../providers/theme-provider';
import { hapticLight } from '../../lib/haptics';
import { timing } from '../../theme/animations';

type BluetoothStatusIconProps = {
  isConnected: boolean;
  isScanning: boolean;
  onPress: () => void;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function BluetoothStatusIcon({ isConnected, isScanning, onPress }: BluetoothStatusIconProps) {
  const { systemColors, brandColors: themeBrandColors } = useTheme();
  const pulseOpacity = useSharedValue(1);

  useEffect(() => {
    if (isScanning) {
      pulseOpacity.value = withRepeat(withTiming(0.3, { duration: timing.slow }), -1, true);
    } else {
      cancelAnimation(pulseOpacity);
      pulseOpacity.value = withTiming(1, { duration: timing.fast });
    }
  }, [isScanning, pulseOpacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
  }));

  const handlePress = () => {
    hapticLight();
    onPress();
  };

  const iconName = isConnected ? 'bluetooth.connected' : 'bluetooth';
  const iconColor = isConnected ? themeBrandColors.success : (systemColors.secondaryLabel as string);

  return (
    <AnimatedPressable
      onPress={handlePress}
      accessibilityRole="button"
      hitSlop={8}
      style={[styles.container, animatedStyle]}
    >
      <Icon name={iconName} size={22} color={iconColor} />
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 4,
  },
});
