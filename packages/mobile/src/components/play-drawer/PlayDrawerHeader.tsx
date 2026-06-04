import { memo, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { getGradeColor, DEFAULT_GRADE_COLOR } from '@boardsesh/board-constants/grade-colors';
import { Text } from '../Text';
import { iosSystemColors } from '../../theme/ios-colors';
import { spacing } from '../../theme/tokens';

type PlayDrawerHeaderProps = {
  name: string;
  /** Display label (already formatted to V or Font per user preference). */
  difficulty: string;
  /** Raw difficulty (e.g. "6a/V3") used for grade-color lookup. Optional —
   *  falls back to `difficulty` if not provided. */
  rawDifficulty?: string;
  qualityAverage: string;
  ascensionistCount: number;
  stars: number;
  setterUsername: string;
};

export const PlayDrawerHeader = memo(function PlayDrawerHeader({
  name,
  difficulty,
  rawDifficulty,
  qualityAverage,
  ascensionistCount,
  stars,
  setterUsername,
}: PlayDrawerHeaderProps) {
  const { t } = useTranslation('climbs');
  const gradeColor = useMemo(
    () => getGradeColor(rawDifficulty ?? difficulty) ?? DEFAULT_GRADE_COLOR,
    [rawDifficulty, difficulty],
  );

  const qualityNum = parseFloat(qualityAverage);
  const qualityDisplay = stars > 0 ? stars.toFixed(1) : qualityNum > 0 ? qualityNum.toFixed(1) : null;

  const subtitleParts: string[] = [];
  if (qualityDisplay) subtitleParts.push(`${qualityDisplay}★`);
  subtitleParts.push(t('sends', { count: ascensionistCount }));
  if (setterUsername) subtitleParts.push(setterUsername);

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.leadingSpacer} />
        <View style={styles.centerColumn}>
          <Text variant="body" style={styles.nameText} numberOfLines={1}>
            {name}
          </Text>
          <Text variant="caption1" style={styles.subtitleText} numberOfLines={1}>
            {subtitleParts.join(' · ')}
          </Text>
        </View>
        <Text variant="headline" style={[styles.gradeText, { color: gradeColor }]} numberOfLines={1}>
          {difficulty}
        </Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    minHeight: 56,
    justifyContent: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  leadingSpacer: {
    flexShrink: 0,
    minWidth: 48,
  },
  centerColumn: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
  },
  gradeText: {
    flexShrink: 0,
    minWidth: 48,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
    textAlign: 'right',
  },
  nameText: {
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitleText: {
    color: iosSystemColors.systemGray,
    marginTop: 2,
    textAlign: 'center',
  },
});
