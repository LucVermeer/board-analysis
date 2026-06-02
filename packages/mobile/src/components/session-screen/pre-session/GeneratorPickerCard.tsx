import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { BoardName } from '@boardsesh/shared-schema';
import { getGradesForBoard } from '@boardsesh/board-config';
import {
  DEFAULT_GRADE_FOCUS_OPTIONS,
  DEFAULT_LADDER_OPTIONS,
  DEFAULT_PYRAMID_OPTIONS,
  DEFAULT_VOLUME_OPTIONS,
  type GeneratorOptions,
  type WorkoutType,
} from '@boardsesh/playlist-generator';
import { Text } from '../../Text';
import { useTheme } from '../../../providers/theme-provider';
import { spacing, borderRadius } from '../../../theme/tokens';
import { brandColors } from '../../../theme/colors';
import { iosSystemColors } from '../../../theme/ios-colors';

export type GeneratorSelection = { type: 'off' } | { type: 'on'; options: GeneratorOptions };

type GeneratorPickerCardProps = {
  boardName: BoardName | null;
  selection: GeneratorSelection;
  onChange: (selection: GeneratorSelection) => void;
};

type WorkoutChip = { value: WorkoutType | 'off'; labelKey: string };

const CHIPS: WorkoutChip[] = [
  { value: 'off', labelKey: 'mobile.session.preGeneratorOff' },
  { value: 'volume', labelKey: 'mobile.session.preGeneratorVolume' },
  { value: 'pyramid', labelKey: 'mobile.session.preGeneratorPyramid' },
  { value: 'ladder', labelKey: 'mobile.session.preGeneratorLadder' },
  { value: 'gradeFocus', labelKey: 'mobile.session.preGeneratorGradeFocus' },
];

function buildDefaultOptions(type: WorkoutType, targetGrade: number): GeneratorOptions {
  switch (type) {
    case 'volume':
      return { ...DEFAULT_VOLUME_OPTIONS, targetGrade };
    case 'pyramid':
      return { ...DEFAULT_PYRAMID_OPTIONS, targetGrade };
    case 'ladder':
      return { ...DEFAULT_LADDER_OPTIONS, targetGrade };
    case 'gradeFocus':
      return { ...DEFAULT_GRADE_FOCUS_OPTIONS, targetGrade };
  }
}

function getDefaultTargetGrade(boardName: BoardName | null): number {
  if (!boardName) return 15;
  const grades = getGradesForBoard(boardName);
  if (grades.length === 0) return 15;
  return grades[Math.floor(grades.length / 2)].difficulty_id;
}

/**
 * Workout-type selector. Off keeps the queue empty (user fills it manually);
 * any other choice pre-populates the queue from the shared `@boardsesh/playlist-generator`
 * algorithm and the chosen target grade. Defaults come from the shared package
 * so web and mobile agree on the starting state for each workout type.
 */
export function GeneratorPickerCard({ boardName, selection, onChange }: GeneratorPickerCardProps) {
  const { t } = useTranslation('session');
  const { systemColors } = useTheme();

  const handleSelectType = (value: WorkoutType | 'off') => {
    if (value === 'off') {
      onChange({ type: 'off' });
      return;
    }
    const currentTarget = selection.type === 'on' ? selection.options.targetGrade : getDefaultTargetGrade(boardName);
    onChange({ type: 'on', options: buildDefaultOptions(value, currentTarget) });
  };

  const handleSelectGrade = (difficultyId: number) => {
    if (selection.type !== 'on') return;
    onChange({ type: 'on', options: { ...selection.options, targetGrade: difficultyId } });
  };

  const gradeChoices = boardName ? getGradesForBoard(boardName) : [];
  const activeType = selection.type === 'on' ? selection.options.type : 'off';

  return (
    <View
      style={[styles.card, { backgroundColor: systemColors.secondaryBackground, borderColor: systemColors.separator }]}
    >
      <Text variant="footnote" color={systemColors.secondaryLabel} style={styles.label}>
        {t('mobile.session.preGeneratorLabel')}
      </Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {CHIPS.map((chip) => {
          const isActive = chip.value === activeType;
          return (
            <Pressable
              key={chip.value}
              onPress={() => handleSelectType(chip.value)}
              style={[
                styles.chip,
                {
                  borderColor: isActive ? brandColors.primary : systemColors.separator,
                  backgroundColor: isActive ? brandColors.primary : 'transparent',
                },
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
            >
              <Text variant="footnote" color={isActive ? iosSystemColors.white : systemColors.label}>
                {t(chip.labelKey)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {selection.type === 'on' && boardName != null ? (
        <View style={styles.gradeSection}>
          <Text variant="footnote" color={systemColors.secondaryLabel} style={styles.subLabel}>
            {t('mobile.session.preGeneratorTargetGrade')}
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {gradeChoices.map((grade) => {
              const isActive = grade.difficulty_id === selection.options.targetGrade;
              return (
                <Pressable
                  key={grade.difficulty_id}
                  onPress={() => handleSelectGrade(grade.difficulty_id)}
                  style={[
                    styles.gradeChip,
                    {
                      borderColor: isActive ? brandColors.primary : systemColors.separator,
                      backgroundColor: isActive ? brandColors.primary : 'transparent',
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  accessibilityLabel={grade.difficulty_name}
                >
                  <Text variant="footnote" color={isActive ? iosSystemColors.white : systemColors.label}>
                    {grade.difficulty_name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing[3],
    gap: spacing[2],
  },
  label: {
    paddingHorizontal: spacing[4],
  },
  subLabel: {
    paddingHorizontal: spacing[4],
    marginTop: spacing[1],
  },
  chipRow: {
    paddingHorizontal: spacing[4],
    gap: spacing[2],
  },
  chip: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: borderRadius.full,
    borderWidth: 1,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradeSection: {
    gap: spacing[2],
  },
  gradeChip: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: 16,
    borderWidth: 1,
    minWidth: 48,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
