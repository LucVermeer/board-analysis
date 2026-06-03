import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { getGradeTextColor } from '@boardsesh/play-view';
import type { RawGradeHighlight, RawStatisticsSummary } from '@boardsesh/profile-stats';
import { Text } from '../Text';
import { Icon } from '../Icon';
import { type IconName } from '../icon-map';
import { Card } from '../Card';
import { LayoutPercentageBar } from './LayoutPercentageBar';
import { gradeBadgeColor } from './profile-chart-colors';
import { brandColors } from '../../theme/colors';
import { spacing, borderRadius } from '../../theme/tokens';
import { useTheme } from '../../providers/theme-provider';

type Percentile = { percentile: number; totalActiveUsers: number } | null;

type StatsSummaryCardProps = {
  statisticsSummary: RawStatisticsSummary;
  hardestSend: RawGradeHighlight | null;
  hardestFlash: RawGradeHighlight | null;
  percentile: Percentile;
};

export function StatsSummaryCard({ statisticsSummary, hardestSend, hardestFlash, percentile }: StatsSummaryCardProps) {
  const { t } = useTranslation('profile');
  const { systemColors } = useTheme();

  const showPercentile = percentile != null && percentile.percentile > 0;
  // "Top X%" — invert the percentile, clamped so a 100th-percentile climber
  // reads "Top 0.1%" rather than "Top 0%".
  const topPercent = showPercentile ? Math.max(0.1, 100 - percentile.percentile) : 0;

  return (
    <Card style={styles.card}>
      <View style={styles.tiles}>
        <View style={[styles.tile, { backgroundColor: systemColors.fill }]}>
          <Text variant="title2">{statisticsSummary.totalAscents}</Text>
          <Text variant="caption1" color={systemColors.secondaryLabel}>
            {t('stats.problems')}
          </Text>
        </View>
        {hardestSend && <GradeTile highlight={hardestSend} label={t('stats.send')} icon="tick" />}
        {hardestFlash && <GradeTile highlight={hardestFlash} label={t('stats.flash')} icon="flash" />}
      </View>

      {showPercentile && (
        <View style={styles.percentile}>
          <View style={styles.percentileRow}>
            <Text variant="footnote" color={systemColors.secondaryLabel}>
              {t('stats.percentile')}
            </Text>
            <Text variant="footnote" style={styles.percentileValue}>
              {t('stats.topPercent', { value: topPercent.toFixed(topPercent < 1 ? 1 : 0) })}
            </Text>
          </View>
          <View style={[styles.percentileTrack, { backgroundColor: systemColors.fill }]}>
            <View style={[styles.percentileFill, { width: `${percentile.percentile}%` }]} />
          </View>
          <Text variant="caption2" color={systemColors.tertiaryLabel} style={styles.percentileCaption}>
            {t('stats.moreSentThan', { value: percentile.percentile.toFixed(0) })}
          </Text>
        </View>
      )}

      <LayoutPercentageBar layoutPercentages={statisticsSummary.layoutPercentages} />
    </Card>
  );
}

function GradeTile({ highlight, label, icon }: { highlight: RawGradeHighlight; label: string; icon: IconName }) {
  const background = gradeBadgeColor(highlight.label);
  const textColor = getGradeTextColor(background);
  return (
    <View style={[styles.tile, { backgroundColor: background }]}>
      <View style={styles.gradeRow}>
        <Icon name={icon} size={14} color={textColor} />
        <Text variant="title3" color={textColor}>
          {highlight.label}
        </Text>
      </View>
      {/* Match the grade/icon's contrast-aware colour; secondaryLabel is a grey
          that washes out on saturated grade tiles. Dim slightly for hierarchy. */}
      <Text variant="caption1" color={textColor} style={styles.gradeTileLabel}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing[4],
  },
  tiles: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  tile: {
    flex: 1,
    borderRadius: borderRadius.md,
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[2],
    alignItems: 'center',
    gap: spacing[1],
  },
  gradeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
  },
  gradeTileLabel: {
    opacity: 0.85,
  },
  percentile: {
    marginTop: spacing[5],
  },
  percentileRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  percentileValue: {
    fontWeight: '600',
  },
  percentileTrack: {
    height: 8,
    borderRadius: borderRadius.full,
    marginTop: spacing[2],
    overflow: 'hidden',
  },
  percentileFill: {
    height: '100%',
    borderRadius: borderRadius.full,
    backgroundColor: brandColors.primary,
  },
  percentileCaption: {
    marginTop: spacing[1],
  },
});
