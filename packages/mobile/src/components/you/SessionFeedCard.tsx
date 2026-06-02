import { memo, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { SessionFeedItem } from '@boardsesh/shared-schema';
import { formatTickRelativeTime } from '@boardsesh/profile-stats';
import { getGradeTextColor } from '@boardsesh/play-view';
import { Text } from '../Text';
import { Icon } from '../Icon';
import { type IconName } from '../icon-map';
import { Card } from '../Card';
import { AvatarGroup } from './AvatarGroup';
import { FeedSocialRow } from './FeedSocialRow';
import { StackedBarChart } from './YouCharts';
import { gradeBadgeColor } from './profile-chart-colors';
import { brandColors, withAlpha } from '../../theme/colors';
import { iosSystemColors } from '../../theme/ios-colors';
import { spacing, borderRadius } from '../../theme/tokens';
import { useTheme } from '../../providers/theme-provider';

type SessionFeedCardProps = {
  session: SessionFeedItem;
  /** Per-viewer vote summary (count + userVote) for this session, if loaded. */
  voteSummary?: { upvotes: number; userVote: number | null };
  onOpenComments: (sessionId: string) => void;
};

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

export const SessionFeedCard = memo(function SessionFeedCard({
  session,
  voteSummary,
  onOpenComments,
}: SessionFeedCardProps) {
  const { t } = useTranslation('feed');
  const { systemColors } = useTheme();

  const names = session.participants
    .map((participant) => participant.displayName)
    .filter((name): name is string => !!name)
    .join(', ');

  const gradeBars = useMemo(
    () =>
      session.gradeDistribution.length > 0
        ? session.gradeDistribution.map((item) => ({
            key: item.grade,
            label: item.grade,
            segments: [{ value: item.flash + item.send, key: item.grade, label: item.grade }],
          }))
        : null,
    [session.gradeDistribution],
  );

  return (
    <Card style={styles.card} haptic={false}>
      <View style={styles.header}>
        <AvatarGroup participants={session.participants} size={32} />
        <View style={styles.headerText}>
          <Text variant="subheadline" style={styles.names} numberOfLines={1}>
            {names || t('sessionFeedCard.climbCount', { count: session.tickCount })}
          </Text>
          <View style={styles.meta}>
            <Text variant="caption1" color={systemColors.tertiaryLabel}>
              {formatTickRelativeTime(session.lastTickAt)}
            </Text>
            {session.durationMinutes != null && session.durationMinutes > 0 && (
              <View style={styles.metaItem}>
                <Icon name="clock" size={11} color={systemColors.tertiaryLabel} />
                <Text variant="caption1" color={systemColors.tertiaryLabel}>
                  {formatDuration(session.durationMinutes)}
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>

      {session.goal ? (
        <View style={styles.goal}>
          <Icon name="flag" size={13} color={systemColors.secondaryLabel} />
          <Text variant="footnote" color={systemColors.secondaryLabel} numberOfLines={2}>
            {session.goal}
          </Text>
        </View>
      ) : null}

      <View style={styles.chips}>
        {session.totalFlashes > 0 && <Chip icon="flash" label={`${session.totalFlashes}`} tint={brandColors.warning} />}
        {session.totalSends > 0 && <Chip icon="tick" label={`${session.totalSends}`} tint={brandColors.success} />}
        {session.totalAttempts > 0 && (
          <Chip icon="circle" label={`${session.totalAttempts}`} tint={iosSystemColors.systemGray} />
        )}
        {session.hardestGrade ? <GradeChip grade={session.hardestGrade} /> : null}
      </View>

      {gradeBars && (
        <View style={styles.chart}>
          <StackedBarChart bars={gradeBars} colorBy="grade" height={84} />
        </View>
      )}

      <View style={styles.boardRow}>
        <Text variant="caption1" color={systemColors.tertiaryLabel} numberOfLines={1} style={styles.flex}>
          {session.boardTypes.join(' · ')}
        </Text>
        <Text variant="caption1" color={systemColors.tertiaryLabel}>
          {t('sessionFeedCard.climbCount', { count: session.tickCount })}
        </Text>
      </View>

      <FeedSocialRow
        sessionId={session.sessionId}
        upvotes={voteSummary?.upvotes ?? session.upvotes}
        userVote={voteSummary?.userVote ?? null}
        commentCount={session.commentCount}
        onOpenComments={onOpenComments}
      />
    </Card>
  );
});

function Chip({ icon, label, tint }: { icon: IconName; label: string; tint: string }) {
  return (
    <View style={[styles.chip, { backgroundColor: withAlpha(tint, 0.15) }]}>
      <Icon name={icon} size={12} color={tint} />
      <Text variant="caption1" color={tint} style={styles.chipLabel}>
        {label}
      </Text>
    </View>
  );
}

function GradeChip({ grade }: { grade: string }) {
  const background = gradeBadgeColor(grade);
  const textColor = getGradeTextColor(background);
  return (
    <View style={[styles.chip, { backgroundColor: background }]}>
      <Text variant="caption1" color={textColor} style={styles.chipLabel}>
        {grade}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: spacing[4], marginTop: spacing[3] },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  headerText: { flex: 1 },
  names: { fontWeight: '600' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], marginTop: 2 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  goal: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], marginTop: spacing[3] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2], marginTop: spacing[3] },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing[2],
    paddingVertical: 3,
    borderRadius: borderRadius.full,
  },
  chipLabel: { fontWeight: '600' },
  chart: { marginTop: spacing[3] },
  boardRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing[3], gap: spacing[2] },
  flex: { flex: 1 },
});
