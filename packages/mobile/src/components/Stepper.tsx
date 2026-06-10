import { StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { Icon } from './Icon';
import { PressableSurface } from './PressableSurface';
import { useTheme } from '../providers/theme-provider';
import { spacing, borderRadius } from '../theme/tokens';

type StepperProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (nextValue: number) => void;
  decreaseLabel: string;
  increaseLabel: string;
};

function clampStepperValue(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * A grouped-list stepper row: label on the left, value + −/+ controls trailing.
 * Designed to sit inside an iOS grouped inset card (one per row, hairline
 * divided by the parent). Clamps to [min, max] before reporting changes.
 */
export function Stepper({ label, value, min, max, onChange, decreaseLabel, increaseLabel }: StepperProps) {
  const { systemColors, brandColors, opacity: themeOpacity } = useTheme();
  const decrementDisabled = value <= min;
  const incrementDisabled = value >= max;

  const updateValue = (nextValue: number) => onChange(clampStepperValue(nextValue, min, max));

  return (
    <View style={styles.row}>
      <Text variant="body" style={styles.label}>
        {label}
      </Text>
      <View style={styles.trailing}>
        <Text variant="body" color={systemColors.label} style={styles.value}>
          {value}
        </Text>
        <View style={[styles.controls, { backgroundColor: systemColors.tertiaryBackground }]}>
          <PressableSurface
            onPress={() => updateValue(value - 1)}
            disabled={decrementDisabled}
            feedback="scale"
            hitSlop={2}
            accessibilityRole="button"
            accessibilityLabel={decreaseLabel}
            style={[styles.button, decrementDisabled ? { opacity: themeOpacity.disabled } : null]}
          >
            <Icon name="minus" size={16} color={decrementDisabled ? systemColors.tertiaryLabel : brandColors.primary} />
          </PressableSurface>
          <View style={[styles.controlDivider, { backgroundColor: systemColors.separator }]} />
          <PressableSurface
            onPress={() => updateValue(value + 1)}
            disabled={incrementDisabled}
            feedback="scale"
            hitSlop={2}
            accessibilityRole="button"
            accessibilityLabel={increaseLabel}
            style={[styles.button, incrementDisabled ? { opacity: themeOpacity.disabled } : null]}
          >
            <Icon name="plus" size={16} color={incrementDisabled ? systemColors.tertiaryLabel : brandColors.primary} />
          </PressableSurface>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    minHeight: 44,
    gap: spacing[3],
  },
  label: {
    flex: 1,
    minWidth: 0,
  },
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  value: {
    minWidth: 28,
    textAlign: 'right',
    fontWeight: '600',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  controlDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
  },
  button: {
    width: 44,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
