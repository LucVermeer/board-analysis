import { memo, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { getGradeColor, DEFAULT_GRADE_COLOR } from '@boardsesh/board-constants/grade-colors';
import { Text } from '../Text';
import { formatAscentCount } from '../../lib/format-ascent-count';
import { iosSystemColors } from '../../theme/ios-colors';
import { spacing } from '../../theme/tokens';

type PlayDrawerHeaderProps = {
  name: string;
  difficulty: string;
  qualityAverage: string;
  ascensionistCount: number;
  stars: number;
  setterUsername: string;
};

export const PlayDrawerHeader = memo(function PlayDrawerHeader({
  name,
  difficulty,
  qualityAverage,
  ascensionistCount,
  stars,
  setterUsername,
}: PlayDrawerHeaderProps) {
  const gradeColor = useMemo(() => getGradeColor(difficulty) ?? DEFAULT_GRADE_COLOR, [difficulty]);

  const qualityNum = parseFloat(qualityAverage);
  const qualityDisplay = stars > 0 ? stars.toFixed(1) : qualityNum > 0 ? qualityNum.toFixed(1) : null;

  // Build subtitle parts, filtering empty values
  const subtitleParts: string[] = [];
  if (qualityDisplay) subtitleParts.push(`${qualityDisplay}★`);
  subtitleParts.push(`${formatAscentCount(ascensionistCount)} sends`);
  if (setterUsername) subtitleParts.push(setterUsername);

  return (
    <View style={styles.container}>
      {/* Grade */}
      <View style={styles.gradeColumn}>
        <View style={[styles.gradePill, { backgroundColor: gradeColor }]}>
          <Text variant="footnote" color="#FFFFFF" style={styles.gradeText}>
            {difficulty}
          </Text>
        </View>
      </View>

      {/* Name + details */}
      <View style={styles.centerColumn}>
        <Text variant="body" style={styles.nameText} numberOfLines={1}>
          {name}
        </Text>
        <Text variant="caption1" style={styles.subtitleText} numberOfLines={1}>
          {subtitleParts.join(' · ')}
        </Text>
      </View>

      {/* Spacer for symmetry */}
      <View style={styles.spacer} />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    minHeight: 56,
    gap: spacing[3],
  },
  gradeColumn: {
    flexShrink: 0,
    minWidth: 48,
    alignItems: 'center',
  },
  gradePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  gradeText: {
    fontWeight: '700',
  },
  centerColumn: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
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
  spacer: {
    flexShrink: 0,
    minWidth: 48,
  },
});
