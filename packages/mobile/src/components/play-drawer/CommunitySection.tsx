import { memo, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { BOULDER_GRADES, type BoulderGrade } from '@boardsesh/board-constants/boulder-grade-mapping';
import { getGradeColor, DEFAULT_GRADE_COLOR } from '@boardsesh/board-constants/grade-colors';
import { Text } from '../Text';
import { Icon } from '../Icon';
import { DifficultyByAngleChart, type AngleGradeBar } from './DifficultyByAngleChart';
import { useClimbStatsHistory } from '../../lib/graphql/hooks';
import { useGradeFormat } from '../../hooks/use-grade-format';
import { formatQuality } from '../../lib/format-climb-stats';
import { iosSystemColors } from '../../theme/ios-colors';
import { spacing } from '../../theme/tokens';

type CommunitySectionProps = {
  climbUuid: string;
  boardName: string;
  angle: number;
  qualityAverage: string;
  ascensionistCount: number;
};

const GRADE_BY_ID = new Map<number, BoulderGrade>(BOULDER_GRADES.map((grade) => [grade.difficulty_id, grade]));

export const CommunitySection = memo(function CommunitySection({
  climbUuid,
  boardName,
  qualityAverage,
  ascensionistCount,
}: CommunitySectionProps) {
  const { t } = useTranslation('session');
  const { gradeFormat } = useGradeFormat();
  const { data: history } = useClimbStatsHistory(boardName, climbUuid);

  const qualityNum = parseFloat(qualityAverage);
  const hasQuality = qualityNum > 0;
  const hasAscensionists = ascensionistCount > 0;

  const starIcons = useMemo(() => {
    if (!hasQuality) return null;
    const fullStars = Math.floor(qualityNum);
    return Array.from({ length: 5 }, (_, starIndex) => (
      <Icon
        key={starIndex}
        name={starIndex < fullStars ? 'star.fill' : 'star'}
        size={14}
        color={starIndex < fullStars ? iosSystemColors.starGold : iosSystemColors.systemGray4}
      />
    ));
  }, [qualityNum, hasQuality]);

  // Latest stats snapshot per angle → one bar per angle showing the grade.
  const angleBars = useMemo<AngleGradeBar[]>(() => {
    if (!history) return [];
    const latestByAngle = new Map<number, { difficulty: number; createdAt: string }>();
    for (const entry of history) {
      const difficulty = entry.displayDifficulty ?? entry.difficultyAverage;
      if (difficulty == null) continue;
      const existing = latestByAngle.get(entry.angle);
      if (!existing || new Date(entry.createdAt).getTime() > new Date(existing.createdAt).getTime()) {
        latestByAngle.set(entry.angle, { difficulty, createdAt: entry.createdAt });
      }
    }
    return Array.from(latestByAngle.entries())
      .map(([angle, { difficulty }]) => {
        const grade = GRADE_BY_ID.get(Math.round(difficulty));
        const gradeName = grade ? (gradeFormat === 'font' ? grade.font_grade.toUpperCase() : grade.v_grade) : '';
        return {
          angle,
          difficulty,
          gradeName,
          color: getGradeColor(grade?.difficulty_name) ?? DEFAULT_GRADE_COLOR,
        };
      })
      .sort((a, b) => a.angle - b.angle);
  }, [history, gradeFormat]);

  if (!hasQuality && !hasAscensionists && angleBars.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Icon name="people" size={20} color={iosSystemColors.systemGray} />
        <Text variant="subheadline" color={iosSystemColors.systemGray}>
          {t('mobile.community.empty')}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {hasQuality && (
        <View style={styles.statRow}>
          <View style={styles.starsRow}>{starIcons}</View>
          <Text variant="subheadline" color={iosSystemColors.systemGray}>
            {formatQuality(qualityAverage)} &middot; {t('mobile.community.avgQuality')}
          </Text>
        </View>
      )}

      {hasAscensionists && (
        <View style={styles.statRow}>
          <Icon name="people" size={18} color={iosSystemColors.systemGray} />
          <Text variant="subheadline">{t('mobile.community.ascensionists', { count: ascensionistCount })}</Text>
        </View>
      )}

      {angleBars.length > 0 && (
        <View style={styles.histogram}>
          <Text variant="footnote" color={iosSystemColors.systemGray}>
            {t('mobile.community.gradeByAngle')}
          </Text>
          <DifficultyByAngleChart data={angleBars} />
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    gap: spacing[3],
  },
  emptyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  starsRow: {
    flexDirection: 'row',
    gap: 2,
  },
  histogram: {
    gap: spacing[2],
  },
});
