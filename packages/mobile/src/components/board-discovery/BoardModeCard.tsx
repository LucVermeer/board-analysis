import { Pressable, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { hapticLight } from '../../lib/haptics';
import { springs } from '../../theme/animations';
import { spacing, borderRadius } from '../../theme/tokens';
import { brandColors } from '../../theme/colors';
import { useTheme } from '../../providers/theme-provider';
import { Text } from '../Text';
import { Icon } from '../Icon';
import { ActivityIndicator } from '../ActivityIndicator';
import type { IconName } from '../icon-map';

export type ModeCardState = 'idle' | 'loading' | 'denied' | 'unavailable';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type BoardModeCardProps = {
  icon: IconName;
  label: string;
  /** Small status line under the label (e.g. "Scanning…", "Allow location"). */
  sublabel?: string;
  state?: ModeCardState;
  onPress: () => void;
};

/**
 * Entry card for a discovery mode (Find Nearby / Bluetooth / Custom). Mirrors
 * the web home's mode cards: an icon + label with per-state styling — idle is
 * tappable, loading shows a spinner, denied/unavailable dim and disable.
 */
export function BoardModeCard({ icon, label, sublabel, state = 'idle', onPress }: BoardModeCardProps) {
  const { systemColors } = useTheme();
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const disabled = state === 'denied' || state === 'unavailable' || state === 'loading';
  const tint = state === 'denied' || state === 'unavailable' ? systemColors.tertiaryLabel : brandColors.primary;

  return (
    <AnimatedPressable
      onPress={() => {
        if (disabled) return;
        hapticLight();
        onPress();
      }}
      onPressIn={() => {
        if (!disabled) scale.value = withSpring(0.97, springs.snappy);
      }}
      onPressOut={() => {
        if (!disabled) scale.value = withSpring(1, springs.snappy);
      }}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={[
        animatedStyle,
        styles.card,
        { backgroundColor: systemColors.secondaryBackground, borderColor: systemColors.separator },
        disabled ? styles.dimmed : null,
      ]}
    >
      {state === 'loading' ? (
        <ActivityIndicator size="small" />
      ) : (
        <Icon name={icon} size={28} color={tint} />
      )}
      <Text variant="footnote" numberOfLines={1} style={styles.label}>
        {label}
      </Text>
      {sublabel ? (
        <Text variant="caption2" color={systemColors.secondaryLabel} numberOfLines={1}>
          {sublabel}
        </Text>
      ) : null}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 120,
    height: 120,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing[2],
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[1],
  },
  dimmed: {
    opacity: 0.55,
  },
  label: {
    fontWeight: '600',
    textAlign: 'center',
  },
});
