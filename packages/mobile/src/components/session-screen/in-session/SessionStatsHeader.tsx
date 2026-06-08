import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { SessionSummary } from '@boardsesh/shared-schema';
import { Text } from '../../Text';
import { Icon } from '../../Icon';
import { useTheme } from '../../../providers/theme-provider';
import { brandColors as staticBrandColors } from '../../../theme/colors';
import { spacing, borderRadius } from '../../../theme/tokens';
import { useGradeFormat } from '../../../hooks/use-grade-format';
import { SessionTimer } from './SessionTimer';
import { GradeDistributionChart } from './GradeDistributionChart';

type SessionStatsHeaderProps = {
  summary: SessionSummary | null | undefined;
};

/**
 * Live stats panel at the top of the in-session view. Mirrors the layout of
 * the post-session SessionSummaryView on web: three stat tiles, an optional
 * "hardest send" row, and a grade-distribution chart.
 */
export function SessionStatsHeader({ summary }: SessionStatsHeaderProps) {
  const { t } = useTranslation('session');
  const { systemColors, brandColors } = useTheme();
  const { formatGrade } = useGradeFormat();

  const sends = summary?.totalSends ?? 0;
  const attempts = summary?.totalAttempts ?? 0;
  const startedAt = summary?.startedAt ?? null;
  const hardest = summary?.hardestClimb;

  return (
    <View style={styles.container}>
      <View style={styles.statsRow}>
        <View style={[styles.statCard, { backgroundColor: systemColors.secondaryBackground }]}>
          <Text variant="title2" style={styles.statValue}>
            {sends}
          </Text>
          <Text variant="caption1" color={systemColors.secondaryLabel}>
            {t('mobile.session.inStatsSends')}
          </Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: systemColors.secondaryBackground }]}>
          <Text variant="title2" style={styles.statValue}>
            {attempts}
          </Text>
          <Text variant="caption1" color={systemColors.secondaryLabel}>
            {t('mobile.session.inStatsAttempts')}
          </Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: systemColors.secondaryBackground }]}>
          <SessionTimer startedAt={startedAt} />
          <Text variant="caption1" color={systemColors.secondaryLabel}>
            {t('mobile.session.inStatsDuration')}
          </Text>
        </View>
      </View>

      {hardest ? (
        <View style={[styles.hardestCard, { backgroundColor: systemColors.secondaryBackground }]}>
          <Text variant="caption1" color={systemColors.secondaryLabel}>
            {t('mobile.session.inStatsHardest')}
          </Text>
          <View style={styles.hardestRow}>
            <View style={[styles.gradeBadge, { backgroundColor: staticBrandColors.primary }]}>
              <Text variant="subheadline" color="#FFFFFF" style={styles.gradeBadgeText}>
                {formatGrade(hardest.grade) ?? hardest.grade}
              </Text>
            </View>
            <Text variant="body" numberOfLines={1} style={styles.hardestName}>
              {hardest.climbName}
            </Text>
            {/* gradeBadge above keeps the static brand fill (white text on it);
                this star glyph is a foreground → scheme-aware brand warning. */}
            <Icon name="star.fill" size={18} color={brandColors.warning} />
          </View>
        </View>
      ) : null}

      {summary && summary.gradeDistribution.length > 0 ? (
        <View style={styles.section}>
          <Text variant="footnote" color={systemColors.secondaryLabel} style={styles.sectionLabel}>
            {t('mobile.session.inStatsGrades')}
          </Text>
          <GradeDistributionChart distribution={summary.gradeDistribution} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing[3],
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing[3],
    borderRadius: borderRadius.lg,
    gap: spacing[1],
  },
  statValue: {
    fontWeight: '700',
  },
  hardestCard: {
    padding: spacing[3],
    borderRadius: borderRadius.lg,
    gap: spacing[1],
  },
  hardestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  hardestName: {
    flex: 1,
  },
  gradeBadge: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: borderRadius.full,
  },
  gradeBadgeText: {
    fontWeight: '600',
  },
  section: {
    gap: spacing[2],
  },
  sectionLabel: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
