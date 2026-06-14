import { memo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '../Text';
import { gradeChipColors } from './grade-chip-colors';
import { spacing, borderRadius } from '../../theme/tokens';

type GradeChipProps = {
  /** Display grade label, already formatted for the viewer (e.g. "V6" or "6A"). */
  grade: string;
  /**
   * Raw grade token used to resolve the hue. Defaults to `grade`; pass the
   * unformatted `difficultyName` when the display label differs from the value
   * board-constants keys its colours by.
   */
  hueKey?: string;
};

/** Pill showing a grade in its own vivid colour on a tinted wash of that hue. */
export const GradeChip = memo(function GradeChip({ grade, hueKey }: GradeChipProps) {
  const { fg, bg } = gradeChipColors(hueKey ?? grade);
  return (
    <View style={[styles.chip, { backgroundColor: bg }]}>
      <Text variant="footnote" color={fg} style={styles.label}>
        {grade}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  label: { fontWeight: '700' },
});
