import { View, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../../../src/components/Text';
import { Button } from '../../../src/components/Button';
import { Avatar } from '../../../src/components/Avatar';
import { Icon } from '../../../src/components/Icon';
import { SectionHeader } from '../../../src/components/SectionHeader';
import { Separator } from '../../../src/components/Separator';
import { useTheme } from '../../../src/providers/theme-provider';
import { useSessionSummary } from '../../../src/lib/graphql/hooks';
import { brandColors } from '../../../src/theme/colors';
import { spacing, borderRadius as br } from '../../../src/theme/tokens';

function formatDuration(
  minutes: number | null | undefined,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  if (!minutes || minutes <= 0) return '';
  if (minutes < 60) return t('summary.minutes', { count: minutes });
  const hours = Math.floor(minutes / 60);
  const remainingMins = minutes % 60;
  if (remainingMins === 0) return t('summary.hours', { count: hours });
  return t('summary.hoursAndMinutes', { hours, mins: remainingMins });
}

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

function getGradeColor(index: number): string {
  return GRADE_COLORS[index % GRADE_COLORS.length];
}

export default function SessionSummaryScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const { data: summary, isLoading } = useSessionSummary(sessionId ?? null);
  const { t } = useTranslation('session');
  const { systemColors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  if (isLoading || !summary) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={brandColors.primary} />
      </View>
    );
  }

  const maxGradeCount = Math.max(...summary.gradeDistribution.map((gradeItem) => gradeItem.count), 1);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing[6] }]}
    >
      {/* Duration */}
      {summary.durationMinutes ? (
        <View style={styles.durationRow}>
          <Icon name="clock" size={18} color={systemColors.secondaryLabel} />
          <Text variant="subheadline" color={systemColors.secondaryLabel}>
            {formatDuration(summary.durationMinutes, t)}
          </Text>
        </View>
      ) : null}

      {/* Stats Row */}
      <View style={styles.statsRow}>
        <View style={[styles.statCard, { backgroundColor: systemColors.secondaryBackground }]}>
          <Text variant="title2" style={styles.statValue}>
            {summary.totalSends}
          </Text>
          <Text variant="caption1" color={systemColors.secondaryLabel}>
            {t('summary.sends')}
          </Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: systemColors.secondaryBackground }]}>
          <Text variant="title2" style={styles.statValue}>
            {summary.totalAttempts}
          </Text>
          <Text variant="caption1" color={systemColors.secondaryLabel}>
            {t('summary.attempts')}
          </Text>
        </View>
      </View>

      {/* Hardest Climb */}
      {summary.hardestClimb ? (
        <View style={[styles.hardestCard, { backgroundColor: systemColors.secondaryBackground }]}>
          <Text variant="caption1" color={systemColors.secondaryLabel}>
            {t('summary.hardestSend')}
          </Text>
          <View style={styles.hardestRow}>
            <View style={[styles.gradeBadge, { backgroundColor: brandColors.primary }]}>
              <Text variant="subheadline" color="#FFFFFF" style={styles.gradeBadgeText}>
                {summary.hardestClimb.grade}
              </Text>
            </View>
            <Text variant="body" numberOfLines={1} style={styles.hardestClimbName}>
              {summary.hardestClimb.climbName}
            </Text>
          </View>
        </View>
      ) : null}

      {/* Grade Distribution */}
      {summary.gradeDistribution.length > 0 ? (
        <View style={styles.section}>
          <SectionHeader title={t('summary.gradeDistribution')} />
          <View style={styles.gradeList}>
            {summary.gradeDistribution.map((gradeItem, index) => (
              <View key={gradeItem.grade} style={styles.gradeRow}>
                <Text variant="footnote" color={systemColors.secondaryLabel} style={styles.gradeLabel}>
                  {gradeItem.grade}
                </Text>
                <View style={styles.gradeBarContainer}>
                  <View
                    style={[
                      styles.gradeBar,
                      {
                        width: `${(gradeItem.count / maxGradeCount) * 100}%`,
                        backgroundColor: getGradeColor(index),
                      },
                    ]}
                  />
                </View>
                <Text variant="footnote" color={systemColors.secondaryLabel} style={styles.gradeCount}>
                  {gradeItem.count}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {/* Participants */}
      {summary.participants.length > 0 ? (
        <View style={styles.section}>
          <SectionHeader title={t('summary.participants')} />
          {summary.participants.map((participant, index) => (
            <View key={participant.userId}>
              <View style={styles.participantRow}>
                <Avatar uri={participant.avatarUrl} name={participant.displayName} size={36} />
                <View style={styles.participantInfo}>
                  <Text variant="body" numberOfLines={1}>
                    {participant.displayName ?? t('detail.climberFallback')}
                  </Text>
                  <Text variant="caption1" color={systemColors.secondaryLabel}>
                    {t('summary.sends')}: {participant.sends} · {t('summary.attempts')}: {participant.attempts}
                  </Text>
                </View>
              </View>
              {index < summary.participants.length - 1 ? <Separator /> : null}
            </View>
          ))}
        </View>
      ) : null}

      {/* Goal */}
      {summary.goal ? (
        <View style={[styles.goalCard, { backgroundColor: systemColors.secondaryBackground }]}>
          <Text variant="caption1" color={systemColors.secondaryLabel}>
            {t('summary.goal')}
          </Text>
          <Text variant="body">{summary.goal}</Text>
        </View>
      ) : null}

      {/* Done button */}
      <Button title={t('summary.done')} variant="filled" onPress={() => router.back()} style={styles.doneButton} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: spacing[4],
    gap: spacing[5],
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  durationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing[3],
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing[4],
    borderRadius: br.lg,
  },
  statValue: {
    fontWeight: '700',
  },
  hardestCard: {
    padding: spacing[4],
    borderRadius: br.lg,
    gap: spacing[2],
  },
  hardestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  gradeBadge: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: br.full,
  },
  gradeBadgeText: {
    fontWeight: '600',
  },
  hardestClimbName: {
    flex: 1,
  },
  section: {
    gap: spacing[2],
  },
  gradeList: {
    gap: spacing[2],
  },
  gradeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  gradeLabel: {
    width: 40,
    textAlign: 'right',
  },
  gradeBarContainer: {
    flex: 1,
    height: 20,
    borderRadius: br.sm,
    overflow: 'hidden',
    backgroundColor: 'rgba(120, 120, 128, 0.08)',
  },
  gradeBar: {
    height: '100%',
    borderRadius: br.sm,
  },
  gradeCount: {
    width: 24,
    textAlign: 'right',
  },
  participantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingVertical: spacing[2],
  },
  participantInfo: {
    flex: 1,
    gap: 2,
  },
  goalCard: {
    padding: spacing[4],
    borderRadius: br.lg,
    gap: spacing[1],
  },
  doneButton: {
    marginTop: spacing[2],
  },
});
