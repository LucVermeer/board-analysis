import { memo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { describeLogbookDay, type LogbookDayStats } from '@boardsesh/logbook';
import { Text } from '../Text';
import { withAlpha } from '../../theme/colors';
import { spacing, borderRadius } from '../../theme/tokens';
import { useTheme } from '../../providers/theme-provider';
import { useGradeFormat } from '../../hooks/use-grade-format';
import { selectByVariant } from '../../theme/variants';

type LogbookDayDividerProps = {
  /** Local start-of-day timestamp of the run (from buildLogbookListRows). */
  dayStartMs: number;
  /**
   * Rollup stats, or null while the day may still straddle an unloaded page —
   * a partial count would lie (including to VoiceOver), so an incomplete day
   * shows its date alone until its boundary loads.
   */
  stats: LogbookDayStats | null;
  /** Injected clock (re-evaluated on focus) so "Today" doesn't lie past midnight. */
  now: number;
};

/**
 * Date anchor between logbook day runs — deliberately NOT a session card
 * (sessions live in the Sessions tab): just the day plus a counts rollup with
 * the hardest send. Liquid Glass draws the Velvet Send violet wash; Material
 * gets an M3-style list subheader (no chip). `accessibilityRole="header"` puts
 * each day in the VoiceOver/TalkBack rotor for day-jumping.
 */
export const LogbookDayDivider = memo(function LogbookDayDivider({ dayStartMs, stats, now }: LogbookDayDividerProps) {
  const { t, i18n } = useTranslation('you');
  const { brandColors: brand, systemColors, variant } = useTheme();
  const { formatGrade } = useGradeFormat();

  const { kind } = describeLogbookDay(dayStartMs, now);
  const label =
    kind === 'today'
      ? t('mobile.logbook.day.today')
      : kind === 'yesterday'
        ? t('mobile.logbook.day.yesterday')
        : new Date(dayStartMs).toLocaleDateString(i18n.language, {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            ...(kind === 'older' ? { year: 'numeric' } : {}),
          });

  const topGradeLabel =
    stats?.topDifficultyName != null ? (formatGrade(stats.topDifficultyName) ?? stats.topDifficultyName) : null;
  const rollup = stats
    ? [
        t('mobile.logbook.day.climbs', { count: stats.climbCount }),
        stats.sendCount > 0 ? t('mobile.logbook.day.sends', { count: stats.sendCount }) : null,
        topGradeLabel ? t('mobile.logbook.day.top', { grade: topGradeLabel }) : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : null;

  // One combined announcement; `header` surfaces it in the screen-reader rotor.
  const accessibilityLabel = rollup ? `${label}, ${rollup}` : label;

  const chipStyle = selectByVariant(variant, {
    liquidGlass: { backgroundColor: withAlpha(brand.primary, 0.08), borderRadius: borderRadius.md },
    material: null,
  });
  const labelColor = selectByVariant(variant, {
    liquidGlass: brand.primary,
    material: systemColors.secondaryLabel,
  });

  return (
    <View
      accessible
      accessibilityRole="header"
      accessibilityLabel={accessibilityLabel}
      style={[styles.container, chipStyle]}
    >
      <Text variant="caption1" color={labelColor} style={styles.label}>
        {label}
      </Text>
      {rollup ? (
        <Text variant="caption1" color={labelColor} style={styles.rollup} numberOfLines={1}>
          {rollup}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    // Wrap instead of colliding at accessibility type sizes — the rollup drops
    // below the day label when one line can't hold both.
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: spacing[2],
    marginHorizontal: spacing[4],
    marginTop: spacing[3],
    marginBottom: spacing[1],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1] + 2,
  },
  label: {
    fontWeight: '600',
  },
  rollup: {
    flexShrink: 1,
  },
});
