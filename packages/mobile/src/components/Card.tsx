import { type ReactNode } from 'react';
import { View, StyleSheet, Platform, type ViewStyle } from 'react-native';
import { Card as PaperCard } from 'react-native-paper';
import { PressableSurface } from './PressableSurface';
import { hapticLight } from '../lib/haptics';
import { useTheme } from '../providers/theme-provider';

type CardProps = {
  children: ReactNode;
  onPress?: () => void;
  haptic?: boolean;
  style?: ViewStyle;
};

/**
 * Card routes to a Material 3 `Card` on the Material variant and to the existing
 * Liquid Glass surface on the Liquid Glass variant. The public prop API is
 * identical for both, so call sites never change.
 */
export function Card(props: CardProps) {
  const { variant: uiVariant } = useTheme();
  return uiVariant === 'material' ? <CardMaterial {...props} /> : <CardGlass {...props} />;
}

function CardMaterial({ children, onPress, haptic = true, style }: CardProps) {
  const handlePress = () => {
    if (haptic) hapticLight();
    onPress?.();
  };

  // M3 elevated card. Paper draws its own padding-less surface, so keep the 16dp
  // content padding the Liquid Glass card uses. Only attach onPress when given,
  // mirroring the glass branch (no pressable affordance for a static card).
  return (
    <PaperCard
      mode="elevated"
      onPress={onPress ? handlePress : undefined}
      accessibilityRole={onPress ? 'button' : undefined}
      contentStyle={styles.materialContent}
      style={style}
    >
      {children}
    </PaperCard>
  );
}

// Liquid Glass card — the original implementation, unchanged.
function CardGlass({ children, onPress, haptic = true, style }: CardProps) {
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
  materialContent: {
    padding: 16,
  },
});
