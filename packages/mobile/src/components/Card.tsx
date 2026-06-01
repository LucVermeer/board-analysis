import { type ReactNode } from 'react';
import { View, Pressable, StyleSheet, Platform, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { hapticLight } from '../lib/haptics';
import { springs } from '../theme/animations';
import { useTheme } from '../providers/theme-provider';

type CardProps = {
  children: ReactNode;
  onPress?: () => void;
  haptic?: boolean;
  style?: ViewStyle;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function Card({ children, onPress, haptic = true, style }: CardProps) {
  const { systemColors } = useTheme();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    if (onPress) {
      scale.value = withSpring(0.98, springs.snappy);
    }
  };

  const handlePressOut = () => {
    if (onPress) {
      scale.value = withSpring(1, springs.snappy);
    }
  };

  const handlePress = () => {
    if (haptic) hapticLight();
    onPress?.();
  };

  const backgroundStyle = { backgroundColor: systemColors.secondaryBackground };

  if (onPress) {
    return (
      <AnimatedPressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        accessibilityRole="button"
        style={[animatedStyle, styles.card, backgroundStyle, style]}
      >
        {children}
      </AnimatedPressable>
    );
  }

  return <View style={[styles.card, backgroundStyle, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    padding: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
});
