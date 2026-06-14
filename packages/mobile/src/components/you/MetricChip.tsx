import { memo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '../Text';
import { Icon } from '../Icon';
import { gradeChipColors } from './grade-chip-colors';
import { spacing, borderRadius } from '../../theme/tokens';
import { useTheme } from '../../providers/theme-provider';

type MetricChipProps = {
  /** Big value line (e.g. "3" or "V6"). */
  value: string;
  /** Small caption under the value (e.g. "sends", "hardest"). */
  label: string;
  /**
   * 'neutral' = systemColors.fill background, neutral text (the default — most
   * chips). 'trophy' = grade-hued wash + a small accent star, for the single
   * highlighted "hardest" stat so exactly one chip carries colour.
   */
  variant?: 'neutral' | 'trophy';
  /** Grade token used to resolve the trophy hue (required for 'trophy'). */
  hueKey?: string;
  /** Spoken label; falls back to "value label". */
  accessibilityLabel?: string;
};

/** Value-over-label stat chip for the session card stats rail. */
export const MetricChip = memo(function MetricChip({
  value,
  label,
  variant = 'neutral',
  hueKey,
  accessibilityLabel,
}: MetricChipProps) {
  const { systemColors } = useTheme();
  const trophy = variant === 'trophy' ? gradeChipColors(hueKey) : null;
  const backgroundColor = trophy ? trophy.bg : systemColors.fill;
  const valueColor = trophy ? trophy.fg : systemColors.label;

  return (
    <View
      style={[styles.chip, { backgroundColor }]}
      accessible
      accessibilityLabel={accessibilityLabel ?? `${value} ${label}`}
    >
      <View style={styles.valueRow}>
        {trophy ? <Icon name="star.fill" size={11} color={trophy.fg} /> : null}
        <Text variant="subheadline" color={valueColor} style={styles.value} numberOfLines={1}>
          {value}
        </Text>
      </View>
      <Text variant="caption2" color={systemColors.tertiaryLabel} numberOfLines={1} style={styles.label}>
        {label}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  chip: {
    flex: 1,
    minWidth: 0,
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[2],
    borderRadius: borderRadius.md,
    alignItems: 'center',
    gap: 1,
  },
  valueRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  value: { fontWeight: '700' },
  label: { textTransform: 'lowercase' },
});
