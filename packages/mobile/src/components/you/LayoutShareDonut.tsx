import { useMemo, type ReactNode } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { PieChart } from 'react-native-gifted-charts';
import type { RawLayoutPercentage } from '@boardsesh/profile-stats';
import { Text } from '../Text';
import { layoutChartColor } from './profile-chart-colors';
import { spacing } from '../../theme/tokens';
import { useTheme } from '../../providers/theme-provider';

type LayoutShareDonutProps = {
  layoutPercentages: RawLayoutPercentage[];
  /** Center-label headline — the user's total distinct ascents. */
  totalAscents: number;
};

const DONUT_RADIUS = 62;
const DONUT_INNER_RADIUS = 42;

/**
 * Each layout's share of the user's ascents as a donut, with the total ascents
 * in the hole and a colour-keyed legend beside it. Replaces the old thin stacked
 * bar — the donut reads each board's slice at a glance and the legend keeps the
 * labels off the (low-contrast) segments. Hidden for a single layout, where a
 * share chart says nothing.
 */
export function LayoutShareDonut({ layoutPercentages, totalAscents }: LayoutShareDonutProps) {
  const { systemColors, colorScheme } = useTheme();
  const { t } = useTranslation('profile');

  const slices = useMemo(
    () =>
      layoutPercentages.map((layout) => ({
        value: layout.count,
        color: layoutChartColor(layout.layoutKey, colorScheme),
      })),
    [layoutPercentages, colorScheme],
  );

  if (layoutPercentages.length <= 1) return null;

  const centerLabel = (): ReactNode => (
    <View style={styles.center}>
      <Text variant="title3">{totalAscents}</Text>
      <Text variant="caption2" color={systemColors.secondaryLabel}>
        {t('stats.problems')}
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <PieChart
        data={slices}
        donut
        radius={DONUT_RADIUS}
        innerRadius={DONUT_INNER_RADIUS}
        innerCircleColor="transparent"
        centerLabelComponent={centerLabel}
      />
      <View style={styles.legend}>
        {layoutPercentages.map((layout) => (
          <View key={layout.layoutKey} style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: layoutChartColor(layout.layoutKey, colorScheme) }]} />
            <Text
              variant="caption2"
              color={systemColors.secondaryLabel}
              style={styles.legendLabel}
              numberOfLines={1}
              accessibilityLabel={`${layout.displayName}: ${layout.percentage}%`}
            >
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[4],
  },
  center: {
    alignItems: 'center',
  },
  legend: {
    flex: 1,
    gap: spacing[2],
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendLabel: {
    flex: 1,
  },
});
