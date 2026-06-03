import { type ReactNode } from 'react';
import { View, StyleSheet, Platform, type ViewStyle } from 'react-native';
import { PressableSurface } from './PressableSurface';
import { hapticLight } from '../lib/haptics';
import { useTheme } from '../providers/theme-provider';

type CardProps = {
  children: ReactNode;
  onPress?: () => void;
  haptic?: boolean;
  style?: ViewStyle;
};

export function Card({ children, onPress, haptic = true, style }: CardProps) {
  const { systemColors } = useTheme();

  const handlePress = () => {
    if (haptic) hapticLight();
    onPress?.();
  };

  const backgroundStyle = { backgroundColor: systemColors.secondaryBackground };

  if (onPress) {
    return (
      <PressableSurface
        onPress={handlePress}
        feedback="scale"
        scaleTo={0.98}
        accessibilityRole="button"
        style={[styles.card, backgroundStyle, style]}
      >
        {children}
      </PressableSurface>
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
