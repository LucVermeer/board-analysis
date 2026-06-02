import { StyleSheet, View } from 'react-native';
import type { SessionGradeCount } from '@boardsesh/shared-schema';
import { Text } from '../../Text';
import { useTheme } from '../../../providers/theme-provider';
import { spacing, borderRadius } from '../../../theme/tokens';

type GradeDistributionChartProps = {
  distribution: SessionGradeCount[];
};

// Match the palette used by the summary screen so the live view and the
// post-session view read as the same chart.
const GRADE_COLORS = [
  '#4CAF50',
  '#8BC34A',
  '#CDDC39',
  '#FFC107',
  '#FF9800',
  '#FF5722',
  '#E91E63',
  '#9C27B0',
  '#673AB7',
  '#3F51B5',
  '#2196F3',
  '#00BCD4',
  '#009688',
];

const gradeColor = (index: number): string => GRADE_COLORS[index % GRADE_COLORS.length];

export function GradeDistributionChart({ distribution }: GradeDistributionChartProps) {
  const { systemColors } = useTheme();
  const maxCount = Math.max(...distribution.map((item) => item.count), 1);

  if (distribution.length === 0) return null;

  return (
    <View style={styles.list}>
      {distribution.map((item, index) => (
        <View key={item.grade} style={styles.row}>
          <Text variant="footnote" color={systemColors.secondaryLabel} style={styles.label}>
            {item.grade}
          </Text>
          <View style={[styles.barTrack, { backgroundColor: systemColors.fill }]}>
            <View
              style={[
                styles.bar,
                {
                  width: `${(item.count / maxCount) * 100}%`,
                  backgroundColor: gradeColor(index),
                },
              ]}
            />
          </View>
          <Text variant="footnote" color={systemColors.secondaryLabel} style={styles.count}>
            {item.count}
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
  count: {
    width: 28,
    textAlign: 'right',
  },
});
