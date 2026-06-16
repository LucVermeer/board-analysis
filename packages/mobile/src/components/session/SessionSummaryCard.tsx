import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { SessionDetail } from '@boardsesh/shared-schema';
import { formatTickAbsoluteTime } from '@boardsesh/profile-stats';
import { getGradeTextColor } from '@boardsesh/play-view';
import { Text } from '../Text';
import { Icon } from '../Icon';
import { type IconName } from '../icon-map';
import { Card } from '../Card';
import { AvatarGroup } from '../you/AvatarGroup';
import { FeedSocialRow } from '../you/FeedSocialRow';
import { gradeBadgeColor } from '../you/profile-chart-colors';
import { spacing, borderRadius } from '../../theme/tokens';
import { useTheme } from '../../providers/theme-provider';
import { useGradeFormat } from '../../hooks/use-grade-format';

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

type SessionSummaryCardProps = {
  session: SessionDetail;
  /** Pre-resolved display name (session name or a generated date fallback). */
  title: string;
  onOpenComments: (entityId: string) => void;
};

/**
 * One merged header unit for the session-detail screen: avatars + title + date +
 * board · duration + goal, the Sends/Flashes/Attempts/Hardest tiles, and the
 * session-level reactions — all inside a single Card. Replaces the old stack of a
 * separate hero, a tiles card, and a standalone social row. Only the hardest-grade
 * tile carries colour, so the grade stays the one accent.
 */
export function SessionSummaryCard({ session, title, onOpenComments }: SessionSummaryCardProps) {
  const { systemColors } = useTheme();
  const { t } = useTranslation('you');

  const absoluteDate = formatTickAbsoluteTime(session.lastTickAt, 'MMM D, YYYY · h:mm A');
  const board = session.boardTypes.join(' · ');
  const duration =
    session.durationMinutes != null && session.durationMinutes > 0 ? formatDuration(session.durationMinutes) : null;

  return (
    <Card style={styles.card}>
      <AvatarGroup participants={session.participants} size={44} />
      <Text variant="title1" style={styles.title}>
        {title}
      </Text>

      <Text variant="subheadline" color={systemColors.secondaryLabel}>
        {absoluteDate}
      </Text>

      {board || duration ? (
        <View style={styles.metaRow}>
          {board ? (
            <Text variant="footnote" color={systemColors.secondaryLabel}>
              {board}
            </Text>
          ) : null}
          {board && duration ? (
            <Text variant="footnote" color={systemColors.secondaryLabel}>
              ·
            </Text>
          ) : null}
          {duration ? (
            <View style={styles.metaItem}>
              <Icon name="clock" size={14} color={systemColors.secondaryLabel} />
              <Text variant="footnote" color={systemColors.secondaryLabel}>
                {duration}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {session.goal ? (
        <View style={styles.goal}>
          <Icon name="flag" size={14} color={systemColors.secondaryLabel} />
          <Text variant="footnote" color={systemColors.secondaryLabel} style={styles.goalText}>
            {session.goal}
          </Text>
        </View>
      ) : null}

      <View style={styles.tiles}>
        <StatTile value={session.totalSends} label={t('mobile.sessions.weekly.sends')} icon="tick" />
        <StatTile value={session.totalFlashes} label={t('mobile.sessions.weekly.flashes')} icon="flash" />
        <StatTile value={session.totalAttempts} label={t('mobile.sessions.weekly.attempts')} icon="circle" />
        {session.hardestGrade ? <GradeTile grade={session.hardestGrade} /> : null}
      </View>

      <View style={styles.social}>
        <FeedSocialRow
          entityId={session.sessionId}
          upvotes={session.upvotes}
          userVote={null}
          commentCount={session.commentCount}
          onOpenComments={onOpenComments}
        />
      </View>
    </Card>
  );
}

/** Neutral tile — no colour tint, so only the grade tile stands out. */
function StatTile({ value, label, icon }: { value: number; label: string; icon: IconName }) {
  const { systemColors } = useTheme();
  return (
    <View style={[styles.tile, { backgroundColor: systemColors.fill }]}>
      <View style={styles.valueRow}>
        <Icon name={icon} size={14} color={systemColors.secondaryLabel} />
        <Text variant="title2" color={systemColors.label}>
          {value}
        </Text>
      </View>
      <Text variant="caption1" color={systemColors.secondaryLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function GradeTile({ grade }: { grade: string }) {
  const { t } = useTranslation('feed');
  const { formatGrade } = useGradeFormat();
  const background = gradeBadgeColor(grade);
  const textColor = getGradeTextColor(background);
  const displayGrade = formatGrade(grade) ?? grade;
  return (
    <View style={[styles.tile, { backgroundColor: background }]}>
      <Text variant="title2" color={textColor}>
        {displayGrade}
      </Text>
      <Text variant="caption1" color={textColor} style={styles.gradeLabel} numberOfLines={1}>
        {t('sessionFeedCard.hardest')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: spacing[4], marginTop: spacing[4], gap: spacing[1] },
  title: { marginTop: spacing[1] },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], marginTop: spacing[1] },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: spacing[1] },
  goal: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[2], marginTop: spacing[2] },
  goalText: { flex: 1 },
  tiles: { flexDirection: 'row', gap: spacing[2], marginTop: spacing[3] },
  tile: {
    flex: 1,
    borderRadius: borderRadius.md,
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[2],
    alignItems: 'center',
    gap: spacing[1],
  },
  valueRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[1] },
  gradeLabel: { opacity: 0.85 },
  social: { marginTop: spacing[3] },
});
