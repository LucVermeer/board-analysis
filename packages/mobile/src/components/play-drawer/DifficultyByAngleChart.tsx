import { StyleSheet, View } from 'react-native';
import { Text } from '../Text';
import type { AngleGradeBar } from './community-utils';
import { useTheme } from '../../providers/theme-provider';
import { spacing, borderRadius } from '../../theme/tokens';

type DifficultyByAngleChartProps = {
  data: AngleGradeBar[];
};

/**
 * Horizontal bars of this climb's average grade at each board angle, built
 * from `climbStatsHistory`. There is no per-grade community vote data to draw
 * a true vote histogram, so this shows how the grade shifts with angle.
 *
 * Bar width is normalised against the local grade range (floored one step
 * below the easiest angle) so a 1–2 grade spread is still legible rather than
 * every bar reading near-full.
 */
export function DifficultyByAngleChart({ data }: DifficultyByAngleChartProps) {
  const { systemColors } = useTheme();

  if (data.length === 0) return null;

  const difficulties = data.map((bar) => bar.difficulty);
  const min = Math.min(...difficulties);
  const max = Math.max(...difficulties);
  const lo = min - 1;
  const range = Math.max(max - lo, 1);

  return (
    <View style={styles.list}>
      {data.map((bar) => (
        <View key={bar.angle} style={styles.row}>
          <Text variant="footnote" color={systemColors.secondaryLabel} style={styles.label}>
            {`${bar.angle}°`}
          </Text>
          <View style={[styles.barTrack, { backgroundColor: systemColors.fill }]}>
            <View
              style={[styles.bar, { width: `${((bar.difficulty - lo) / range) * 100}%`, backgroundColor: bar.color }]}
            />
          </View>
          <Text variant="footnote" color={systemColors.secondaryLabel} style={styles.gradeName}>
            {bar.gradeName}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing[2],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  label: {
    width: 40,
    textAlign: 'right',
  },
  barTrack: {
    flex: 1,
    height: 18,
    borderRadius: borderRadius.sm,
    overflow: 'hidden',
  },
  bar: {
    height: '100%',
    borderRadius: borderRadius.sm,
  },
  gradeName: {
    width: 44,
    textAlign: 'right',
  },
});
