import { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { SessionGradeDistributionItem } from '@boardsesh/shared-schema';
import { Card } from '../Card';
import { SectionHeader } from '../SectionHeader';
import { StackedBarChart, type ChartLegendItem } from '../you/YouCharts';
import { buildSessionGradeBars, gradeBadgeColor, gradeChartColor } from '../you/profile-chart-colors';
import { useGradeFormat } from '../../hooks/use-grade-format';
import { useTheme } from '../../providers/theme-provider';
import { spacing } from '../../theme/tokens';

/**
 * Per-session grade breakdown. Renders a grade-distribution chart where each bar
 * is coloured by grade hue, split into a muted send (redpoint) base and a vivid
 * flash cap so a brighter top band reads as "flashed". A compact two-swatch
 * legend explains the shade split. Renders nothing when there's no data.
 */
export function SessionAnalyticsSection({ gradeDistribution }: { gradeDistribution: SessionGradeDistributionItem[] }) {
  const { t } = useTranslation('profile');
  const { colorScheme } = useTheme();
  // Match the grade format the Progress tab / useYouProfileData uses so a
  // session's chart reads identically to the profile's.
  const { formatGrade } = useGradeFormat();

  const gradeBars = useMemo(
    () => buildSessionGradeBars(gradeDistribution, formatGrade, { splitFlash: true, colorScheme }),
    [gradeDistribution, formatGrade, colorScheme],
  );

  // Representative vivid (flash) vs muted (redpoint) swatches so the user reads
  // "brighter shade = flash" — V5 is a mid-palette grade that reads on both.
  const shadeLegend = useMemo<ChartLegendItem[]>(
    () => [
      { label: t('stats.flash'), color: gradeBadgeColor('V5') },
      { label: t('stats.redpoint'), color: gradeChartColor('V5', colorScheme) },
    ],
    [t, colorScheme],
  );

  // `buildSessionGradeBars` returns null for an empty or all-zero distribution,
  // so this covers both the no-distribution and no-ascent cases.
  if (!gradeBars) return null;

  return (
    <View>
      <SectionHeader title={t('stats.gradeDistribution')} />
      <Card style={styles.chartCard}>
        <StackedBarChart bars={gradeBars} colorBy="grade" legend={shadeLegend} fitYAxisToData />
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  chartCard: { marginHorizontal: spacing[4] },
});
