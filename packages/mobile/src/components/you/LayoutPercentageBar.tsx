import { View, StyleSheet } from 'react-native';
import type { RawLayoutPercentage } from '@boardsesh/profile-stats';
import { Text } from '../Text';
import { layoutChartColor } from './profile-chart-colors';
import { spacing, borderRadius } from '../../theme/tokens';
import { useTheme } from '../../providers/theme-provider';

type LayoutPercentageBarProps = {
  layoutPercentages: RawLayoutPercentage[];
};

/**
 * Each layout's share of the user's ascents: a thin stacked bar plus a legend.
 * Labels live in the legend (readable on the card) rather than inside the
 * segments, where white text fell below contrast on the lighter layout hues.
 */
export function LayoutPercentageBar({ layoutPercentages }: LayoutPercentageBarProps) {
  const { systemColors } = useTheme();
  if (layoutPercentages.length <= 1) return null;

  return (
    <View style={styles.container}>
      <View style={styles.track}>
        {layoutPercentages.map((layout) => (
          <View
            key={layout.layoutKey}
            style={[
              styles.segment,
              { width: `${layout.percentage}%`, backgroundColor: layoutChartColor(layout.layoutKey) },
            ]}
            accessibilityLabel={`${layout.displayName}: ${layout.percentage}%`}
          />
        ))}
      </View>
      <View style={styles.legend}>
        {layoutPercentages.map((layout) => (
          <View key={layout.layoutKey} style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: layoutChartColor(layout.layoutKey) }]} />
            <Text variant="caption2" color={systemColors.secondaryLabel}>
              {`${layout.displayName} ${layout.percentage}%`}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: spacing[4],
  },
  track: {
    flexDirection: 'row',
    height: 12,
    borderRadius: borderRadius.sm,
    overflow: 'hidden',
  },
  segment: {
    height: '100%',
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[3],
    marginTop: spacing[2],
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
