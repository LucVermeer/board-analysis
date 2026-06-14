import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { SessionDetail } from '@boardsesh/shared-schema';
import { formatTickAbsoluteTime } from '@boardsesh/profile-stats';
import { Text } from '../Text';
import { Icon } from '../Icon';
import { AvatarGroup } from '../you/AvatarGroup';
import { spacing } from '../../theme/tokens';
import { useTheme } from '../../providers/theme-provider';
import { useGradeFormat } from '../../hooks/use-grade-format';

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

type SessionDetailHeroProps = {
  session: SessionDetail;
  /** Pre-resolved display name (session name or a generated fallback). */
  title: string;
};

/** Hero block for the session-detail screen: avatars, name, summary, date, board · duration, goal. */
export function SessionDetailHero({ session, title }: SessionDetailHeroProps) {
  const { systemColors } = useTheme();
  const { t } = useTranslation('feed');
  const { formatGrade } = useGradeFormat();

  const absoluteDate = formatTickAbsoluteTime(session.lastTickAt, 'MMM D, YYYY · h:mm A');

  // One-line headline summary: "7 sends · 3 flashes" (falling back to the hardest
  // grade when there are no flashes but a hardest grade is known). Built from the
  // totals the hero already receives — no extra props needed.
  const summaryParts: string[] = [];
  if (session.totalSends > 0) {
    summaryParts.push(t('sessionFeedCard.sendsCount', { count: session.totalSends }));
  }
  if (session.totalFlashes > 0) {
    summaryParts.push(t('sessionFeedCard.flashesCount', { count: session.totalFlashes }));
  } else if (session.hardestGrade) {
    const displayGrade = formatGrade(session.hardestGrade) ?? session.hardestGrade;
    summaryParts.push(t('sessionFeedCard.hardestGrade', { grade: displayGrade }));
  }
  const summary = summaryParts.join(' · ');

  const board = session.boardTypes.join(' · ');
  const duration =
    session.durationMinutes != null && session.durationMinutes > 0 ? formatDuration(session.durationMinutes) : null;

  return (
    <View style={styles.container}>
      <AvatarGroup participants={session.participants} size={44} />
      <Text variant="title1" style={styles.title}>
        {title}
      </Text>

      {summary ? (
        <Text variant="subheadline" color={systemColors.secondaryLabel}>
          {summary}
        </Text>
      ) : null}

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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[4],
    gap: spacing[1],
  },
  title: { marginTop: spacing[2] },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], marginTop: spacing[1] },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: spacing[1] },
  goal: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[2], marginTop: spacing[2] },
  goalText: { flex: 1 },
});
