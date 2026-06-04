import { memo, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { getGradeColor, DEFAULT_GRADE_COLOR } from '@boardsesh/board-constants/grade-colors';
import { formatSends, formatQuality } from '../../lib/format-climb-stats';
import { Text } from '../Text';
import { DrawerHeader } from '../DrawerHeader';
import { iosSystemColors } from '../../theme/ios-colors';

type PlayDrawerHeaderProps = {
  name: string;
  /** Display label (already formatted to V or Font per user preference). */
  difficulty: string;
  /** Raw difficulty (e.g. "6a/V3") used for grade-color lookup. Optional —
   *  falls back to `difficulty` if not provided. */
  rawDifficulty?: string;
  qualityAverage: string;
  ascensionistCount: number;
  setterUsername: string;
};

export const PlayDrawerHeader = memo(function PlayDrawerHeader({
  name,
  difficulty,
  rawDifficulty,
  qualityAverage,
  ascensionistCount,
  setterUsername,
}: PlayDrawerHeaderProps) {
  const { t } = useTranslation('climbs');
  const gradeColor = useMemo(
    () => getGradeColor(rawDifficulty ?? difficulty) ?? DEFAULT_GRADE_COLOR,
    [rawDifficulty, difficulty],
  );

  const subtitleParts: string[] = [];
  if (ascensionistCount > 0) subtitleParts.push(formatSends(ascensionistCount, t));
  const qualityNum = parseFloat(qualityAverage);
  if (qualityNum > 0) subtitleParts.push(`${formatQuality(qualityAverage)}★`);
  if (setterUsername) subtitleParts.push(setterUsername);

  return (
    <DrawerHeader
      center={
        <>
          <Text variant="body" style={styles.nameText} numberOfLines={1}>
            {name}
          </Text>
          <Text variant="caption1" style={styles.subtitleText} numberOfLines={1}>
            {subtitleParts.join(' · ')}
          </Text>
        </>
      }
      trailing={
        <Text variant="headline" style={[styles.gradeText, { color: gradeColor }]} numberOfLines={1}>
          {difficulty}
        </Text>
      }
    />
  );
});

const styles = StyleSheet.create({
  gradeText: {
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
