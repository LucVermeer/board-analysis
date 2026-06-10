import { useEffect, useMemo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useTranslation } from 'react-i18next';
import type { BoardName } from '@boardsesh/shared-schema';
import { getGradesForBoard } from '@boardsesh/board-config';
import {
  KILTER_HOMEWALL_LAYOUT_ID,
  isKilterHomewallTallSizeId,
  isKilterHomewallWideSizeId,
} from '@boardsesh/board-constants';
import {
  formatMinAscentsFilterCount,
  getMinAscentsFilterOptions,
  getMinRatingPickerValue,
} from '@boardsesh/climb-filters';
import {
  CLIMB_BIAS_OPTIONS,
  DEFAULT_GRADE_FOCUS_OPTIONS,
  DEFAULT_LADDER_OPTIONS,
  DEFAULT_PYRAMID_OPTIONS,
  DEFAULT_VOLUME_OPTIONS,
  WARM_UP_OPTIONS,
  type ClimbBias,
  type GeneratorOptions,
  type WarmUpType,
  type WorkoutType,
} from '@boardsesh/playlist-generator';
import { SHARED_EVENTS } from '@boardsesh/analytics';
import { track } from '../../../lib/analytics';
import { Text } from '../../Text';
import { useTheme } from '../../../providers/theme-provider';
import { useGradeFormat } from '../../../hooks/use-grade-format';
import { spacing, borderRadius } from '../../../theme/tokens';
import { brandColors as staticBrandColors } from '../../../theme/colors';
import { iosSystemColors } from '../../../theme/ios-colors';
import { Icon } from '../../Icon';
import { PressableSurface } from '../../PressableSurface';
import { StarRating } from '../../StarRating';
import { SwitchRow } from '../../SwitchRow';

export type GeneratorSelection = { type: 'off' } | { type: 'on'; options: GeneratorOptions };

type GeneratorPickerCardProps = {
  boardName: BoardName | null;
  layoutId: number | null;
  sizeId: number | null;
  /** Board angle, forwarded to the `Workout Generator Opened` event to match web. */
  angle: number | null;
  selection: GeneratorSelection;
  onChange: (selection: GeneratorSelection) => void;
};

type ChipValue = WorkoutType | 'off';
type CommonGeneratorPatch = Partial<
  Pick<
    GeneratorOptions,
    'warmUp' | 'targetGrade' | 'climbBias' | 'minAscents' | 'minRating' | 'onlyTallClimbs' | 'onlyWideClimbs'
  >
>;

// Static value list — the labels are looked up via inline `t('mobile.session.preGenerator…')`
// calls in `chipLabel()` so the i18n key analyser can see every key as a
// literal. Adding a new entry requires adding both a value here and a case in
// `chipLabel`.
const CHIP_VALUES: ChipValue[] = ['off', 'volume', 'pyramid', 'ladder', 'gradeFocus'];

function chipLabel(value: ChipValue, t: (key: string) => string): string {
  switch (value) {
    case 'off':
      return t('mobile.session.preGeneratorOff');
    case 'volume':
      return t('mobile.session.preGeneratorVolume');
    case 'pyramid':
      return t('mobile.session.preGeneratorPyramid');
    case 'ladder':
      return t('mobile.session.preGeneratorLadder');
    case 'gradeFocus':
      return t('mobile.session.preGeneratorGradeFocus');
  }
}

function warmUpLabel(value: WarmUpType, t: (key: string) => string): string {
  switch (value) {
    case 'standard':
      return t('mobile.session.preGeneratorWarmUpStandard');
    case 'extended':
      return t('mobile.session.preGeneratorWarmUpExtended');
    case 'none':
      return t('mobile.session.preGeneratorWarmUpNone');
  }
}

function climbBiasLabel(value: ClimbBias, t: (key: string) => string): string {
  switch (value) {
    case 'unfamiliar':
      return t('mobile.session.preGeneratorClimbBiasUnfamiliar');
    case 'attempted':
      return t('mobile.session.preGeneratorClimbBiasAttempted');
    case 'any':
      return t('mobile.session.preGeneratorClimbBiasAny');
  }
}

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

function clampStepperValue(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

type NumberStepperProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (nextValue: number) => void;
  decreaseLabel: string;
  increaseLabel: string;
};

function NumberStepper({ label, value, min, max, onChange, decreaseLabel, increaseLabel }: NumberStepperProps) {
  const { systemColors, brandColors, opacity: themeOpacity } = useTheme();
  const decrementDisabled = value <= min;
  const incrementDisabled = value >= max;

  const updateValue = (nextValue: number) => onChange(clampStepperValue(nextValue, min, max));

  return (
    <View style={styles.settingRow}>
      <Text variant="footnote" color={systemColors.secondaryLabel} style={styles.settingLabel}>
        {label}
      </Text>
      <View
        style={[
          styles.stepperShell,
          { borderColor: systemColors.separator, backgroundColor: systemColors.tertiaryBackground },
        ]}
      >
        <Text variant="subheadline" color={systemColors.label} style={styles.stepperValue}>
          {value}
        </Text>
        <View style={styles.stepperButtons}>
          <PressableSurface
            onPress={() => updateValue(value - 1)}
            disabled={decrementDisabled}
            feedback="scale"
            hitSlop={2}
            accessibilityRole="button"
            accessibilityLabel={decreaseLabel}
            style={[styles.stepperButton, decrementDisabled ? { opacity: themeOpacity.disabled } : null]}
          >
            <Icon name="minus" size={16} color={decrementDisabled ? systemColors.tertiaryLabel : brandColors.primary} />
          </PressableSurface>
          <PressableSurface
            onPress={() => updateValue(value + 1)}
            disabled={incrementDisabled}
            feedback="scale"
            hitSlop={2}
            accessibilityRole="button"
            accessibilityLabel={increaseLabel}
            style={[styles.stepperButton, incrementDisabled ? { opacity: themeOpacity.disabled } : null]}
          >
            <Icon name="plus" size={16} color={incrementDisabled ? systemColors.tertiaryLabel : brandColors.primary} />
          </PressableSurface>
        </View>
      </View>
    </View>
  );
}

type OptionChipProps = {
  label: string;
  active: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
};

function OptionChip({ label, active, onPress, accessibilityLabel }: OptionChipProps) {
  const { systemColors, brandColors } = useTheme();

  return (
    <PressableSurface
      onPress={onPress}
      feedback="scale"
      hitSlop={2}
      style={[
        styles.chip,
        {
          borderColor: active ? brandColors.primary : systemColors.separator,
          backgroundColor: active ? staticBrandColors.primary : 'transparent',
        },
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={accessibilityLabel ?? label}
    >
      <Text variant="footnote" color={active ? iosSystemColors.white : systemColors.label}>
        {label}
      </Text>
    </PressableSurface>
  );
}

function ChipRail({ children }: { children: ReactNode }) {
  return (
    <ScrollView
      horizontal
      nestedScrollEnabled
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.chipRow}
    >
      {children}
    </ScrollView>
  );
}

/**
 * Workout-type selector. Off keeps the queue empty (user fills it manually);
 * any other choice pre-populates the queue from the shared `@boardsesh/playlist-generator`
 * algorithm and the chosen target grade. Defaults come from the shared package
 * so web and mobile agree on the starting state for each workout type.
 */
export function GeneratorPickerCard({
  boardName,
  layoutId,
  sizeId,
  angle,
  selection,
  onChange,
}: GeneratorPickerCardProps) {
  const { t } = useTranslation('session');
  const { systemColors } = useTheme();
  const { formatGrade } = useGradeFormat();

  const isKilterHomewall = boardName === 'kilter' && layoutId === KILTER_HOMEWALL_LAYOUT_ID;
  const showTallClimbsFilter = isKilterHomewall && sizeId != null && isKilterHomewallTallSizeId(sizeId);
  const showWideClimbsFilter = isKilterHomewall && sizeId != null && isKilterHomewallWideSizeId(sizeId);

  useEffect(() => {
    if (selection.type !== 'on') return;
    const shouldClearTallClimbs = selection.options.onlyTallClimbs && !showTallClimbsFilter;
    const shouldClearWideClimbs = selection.options.onlyWideClimbs && !showWideClimbsFilter;
    if (!shouldClearTallClimbs && !shouldClearWideClimbs) return;
    onChange({
      type: 'on',
      options: {
        ...selection.options,
        ...(shouldClearTallClimbs ? { onlyTallClimbs: false } : {}),
        ...(shouldClearWideClimbs ? { onlyWideClimbs: false } : {}),
      },
    });
  }, [selection, showTallClimbsFilter, showWideClimbsFilter, onChange]);

  const gradeChoices = boardName ? getGradesForBoard(boardName) : [];
  const activeType = selection.type === 'on' ? selection.options.type : 'off';

  const minAscentsOptions = useMemo(() => {
    const baseOptions = getMinAscentsFilterOptions();
    if (selection.type !== 'on' || baseOptions.includes(selection.options.minAscents)) return baseOptions;
    return [...baseOptions, selection.options.minAscents].sort((first, second) => first - second);
  }, [selection]);

  const handleSelectType = (value: ChipValue) => {
    if (value === 'off') {
      onChange({ type: 'off' });
      return;
    }
    // Enabling the generator (off → a workout type) reveals the configurator —
    // the mobile analogue of web's `Workout Generator Opened`. Match web's exact
    // payload (playlist-generator-drawer.tsx): `{ targetType, boardName, angle }`.
    // The pre-session flow always feeds the session queue, so targetType is
    // 'session'; PostHog groups by exact prop name, so the keys must line up.
    if (selection.type === 'off') {
      track(SHARED_EVENTS.WorkoutGeneratorOpened, { targetType: 'session', boardName, angle });
    }
    const currentTarget = selection.type === 'on' ? selection.options.targetGrade : getDefaultTargetGrade(boardName);
    onChange({ type: 'on', options: buildDefaultOptions(value, currentTarget) });
  };

  const updateCommonOptions = (patch: CommonGeneratorPatch) => {
    if (selection.type !== 'on') return;
    onChange({ type: 'on', options: { ...selection.options, ...patch } });
  };

  const renderWorkoutShapeOptions = (options: GeneratorOptions) => {
    switch (options.type) {
      case 'volume':
        return (
          <>
            <NumberStepper
              label={t('mobile.session.preGeneratorMainSetClimbs')}
              value={options.mainSetClimbs}
              min={1}
              max={50}
              onChange={(mainSetClimbs) => onChange({ type: 'on', options: { ...options, mainSetClimbs } })}
              decreaseLabel={t('mobile.session.preGeneratorDecreaseOption', {
                label: t('mobile.session.preGeneratorMainSetClimbs'),
              })}
              increaseLabel={t('mobile.session.preGeneratorIncreaseOption', {
                label: t('mobile.session.preGeneratorMainSetClimbs'),
              })}
            />
            <NumberStepper
              label={t('mobile.session.preGeneratorMainSetVariability')}
              value={options.mainSetVariability}
              min={0}
              max={5}
              onChange={(mainSetVariability) => onChange({ type: 'on', options: { ...options, mainSetVariability } })}
              decreaseLabel={t('mobile.session.preGeneratorDecreaseOption', {
                label: t('mobile.session.preGeneratorMainSetVariability'),
              })}
              increaseLabel={t('mobile.session.preGeneratorIncreaseOption', {
                label: t('mobile.session.preGeneratorMainSetVariability'),
              })}
            />
          </>
        );
      case 'pyramid':
      case 'ladder':
        return (
          <>
            <NumberStepper
              label={t('mobile.session.preGeneratorNumberOfSteps')}
              value={options.numberOfSteps}
              min={3}
              max={15}
              onChange={(numberOfSteps) => onChange({ type: 'on', options: { ...options, numberOfSteps } })}
              decreaseLabel={t('mobile.session.preGeneratorDecreaseOption', {
                label: t('mobile.session.preGeneratorNumberOfSteps'),
              })}
              increaseLabel={t('mobile.session.preGeneratorIncreaseOption', {
                label: t('mobile.session.preGeneratorNumberOfSteps'),
              })}
            />
            <NumberStepper
              label={t('mobile.session.preGeneratorClimbsPerStep')}
              value={options.climbsPerStep}
              min={1}
              max={5}
              onChange={(climbsPerStep) => onChange({ type: 'on', options: { ...options, climbsPerStep } })}
              decreaseLabel={t('mobile.session.preGeneratorDecreaseOption', {
                label: t('mobile.session.preGeneratorClimbsPerStep'),
              })}
              increaseLabel={t('mobile.session.preGeneratorIncreaseOption', {
                label: t('mobile.session.preGeneratorClimbsPerStep'),
              })}
            />
          </>
        );
      case 'gradeFocus':
        return (
          <NumberStepper
            label={t('mobile.session.preGeneratorNumberOfClimbs')}
            value={options.numberOfClimbs}
            min={1}
            max={50}
            onChange={(numberOfClimbs) => onChange({ type: 'on', options: { ...options, numberOfClimbs } })}
            decreaseLabel={t('mobile.session.preGeneratorDecreaseOption', {
              label: t('mobile.session.preGeneratorNumberOfClimbs'),
            })}
            increaseLabel={t('mobile.session.preGeneratorIncreaseOption', {
              label: t('mobile.session.preGeneratorNumberOfClimbs'),
            })}
          />
        );
    }
  };

  const renderGeneratorOptions = () => {
    if (selection.type !== 'on') return null;
    const { options } = selection;
    const minRatingPickerValue = getMinRatingPickerValue(options.minRating);
    const targetGradeLabel = t('mobile.session.preGeneratorTargetGrade');
    const warmUpGroupLabel = t('mobile.session.preGeneratorWarmUp');
    const minAscentsGroupLabel = t('mobile.session.preGeneratorMinAscents');
    const minRatingGroupLabel = t('mobile.session.preGeneratorMinRating');
    const climbBiasGroupLabel = t('mobile.session.preGeneratorClimbBias');

    return (
      <View style={styles.optionsSection}>
        <View style={styles.settingBlock}>
          <Text variant="footnote" color={systemColors.secondaryLabel} style={styles.settingLabel}>
            {warmUpGroupLabel}
          </Text>
          <ChipRail>
            {WARM_UP_OPTIONS.map((warmUp) => (
              <OptionChip
                key={warmUp}
                label={warmUpLabel(warmUp, t)}
                active={options.warmUp === warmUp}
                onPress={() => updateCommonOptions({ warmUp })}
                accessibilityLabel={t('mobile.session.preGeneratorOptionAccessibilityLabel', {
                  group: warmUpGroupLabel,
                  value: warmUpLabel(warmUp, t),
                })}
              />
            ))}
          </ChipRail>
        </View>

        {boardName != null ? (
          <View style={styles.settingBlock}>
            <Text variant="footnote" color={systemColors.secondaryLabel} style={styles.settingLabel}>
              {targetGradeLabel}
            </Text>
            <ChipRail>
              {gradeChoices.map((grade) => {
                const isActive = grade.difficulty_id === options.targetGrade;
                const gradeLabel = formatGrade(grade.difficulty_name) ?? grade.difficulty_name;
                return (
                  <OptionChip
                    key={grade.difficulty_id}
                    label={gradeLabel}
                    active={isActive}
                    onPress={() => updateCommonOptions({ targetGrade: grade.difficulty_id })}
                    accessibilityLabel={t('mobile.session.preGeneratorOptionAccessibilityLabel', {
                      group: targetGradeLabel,
                      value: gradeLabel,
                    })}
                  />
                );
              })}
            </ChipRail>
          </View>
        ) : null}

        {renderWorkoutShapeOptions(options)}

        <View style={styles.settingBlock}>
          <Text variant="footnote" color={systemColors.secondaryLabel} style={styles.settingLabel}>
            {minAscentsGroupLabel}
          </Text>
          <ChipRail>
            {minAscentsOptions.map((minAscents) => {
              const label = t('mobile.session.preGeneratorMinAscentsOption', {
                value: formatMinAscentsFilterCount(minAscents),
              });
              return (
                <OptionChip
                  key={minAscents}
                  label={label}
                  active={options.minAscents === minAscents}
                  onPress={() => updateCommonOptions({ minAscents })}
                  accessibilityLabel={t('mobile.session.preGeneratorOptionAccessibilityLabel', {
                    group: minAscentsGroupLabel,
                    value: label,
                  })}
                />
              );
            })}
          </ChipRail>
        </View>

        <View style={styles.settingBlock}>
          <Text variant="footnote" color={systemColors.secondaryLabel} style={styles.settingLabel}>
            {minRatingGroupLabel}
          </Text>
          <View style={styles.ratingRow}>
            <OptionChip
              label={t('mobile.session.preGeneratorAny')}
              active={minRatingPickerValue == null}
              onPress={() => updateCommonOptions({ minRating: 0 })}
              accessibilityLabel={t('mobile.session.preGeneratorOptionAccessibilityLabel', {
                group: minRatingGroupLabel,
                value: t('mobile.session.preGeneratorAny'),
              })}
            />
            <StarRating
              value={minRatingPickerValue ?? undefined}
              onChange={(rating) => updateCommonOptions({ minRating: rating ?? 0 })}
              accessibilityHint={t('mobile.session.preGeneratorMinRatingStarHint')}
              getAccessibilityLabel={(rating, selected) =>
                t(
                  selected
                    ? 'mobile.session.preGeneratorMinRatingStarSelectedAccessibilityLabel'
                    : 'mobile.session.preGeneratorMinRatingStarAccessibilityLabel',
                  { count: rating },
                )
              }
            />
          </View>
        </View>

        <View style={styles.settingBlock}>
          <Text variant="footnote" color={systemColors.secondaryLabel} style={styles.settingLabel}>
            {climbBiasGroupLabel}
          </Text>
          <ChipRail>
            {CLIMB_BIAS_OPTIONS.map((climbBias) => (
              <OptionChip
                key={climbBias}
                label={climbBiasLabel(climbBias, t)}
                active={options.climbBias === climbBias}
                onPress={() => updateCommonOptions({ climbBias })}
                accessibilityLabel={t('mobile.session.preGeneratorOptionAccessibilityLabel', {
                  group: climbBiasGroupLabel,
                  value: climbBiasLabel(climbBias, t),
                })}
              />
            ))}
          </ChipRail>
        </View>

        {showTallClimbsFilter || showWideClimbsFilter ? (
          <View style={[styles.switchGroup, { borderColor: systemColors.separator }]}>
            {showTallClimbsFilter ? (
              <SwitchRow
                label={t('mobile.session.preGeneratorTallClimbsLabel')}
                description={t('mobile.session.preGeneratorTallClimbsDescription')}
                value={options.onlyTallClimbs}
                onValueChange={(onlyTallClimbs) => updateCommonOptions({ onlyTallClimbs })}
              />
            ) : null}
            {showWideClimbsFilter ? (
              <SwitchRow
                label={t('mobile.session.preGeneratorWideClimbsLabel')}
                description={t('mobile.session.preGeneratorWideClimbsDescription')}
                value={options.onlyWideClimbs}
                onValueChange={(onlyWideClimbs) => updateCommonOptions({ onlyWideClimbs })}
              />
            ) : null}
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <View
      style={[styles.card, { backgroundColor: systemColors.secondaryBackground, borderColor: systemColors.separator }]}
    >
      <Text variant="footnote" color={systemColors.secondaryLabel} style={styles.label}>
        {t('mobile.session.preGeneratorLabel')}
      </Text>

      <ChipRail>
        {CHIP_VALUES.map((value) => {
          const isActive = value === activeType;
          const label = chipLabel(value, t);
          return (
            <OptionChip
              key={value}
              label={label}
              active={isActive}
              onPress={() => handleSelectType(value)}
              accessibilityLabel={t('mobile.session.preGeneratorOptionAccessibilityLabel', {
                group: t('mobile.session.preGeneratorLabel'),
                value: label,
              })}
            />
          );
        })}
      </ChipRail>

      {renderGeneratorOptions()}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing[3],
    gap: spacing[3],
  },
  label: {
    paddingHorizontal: spacing[4],
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
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionsSection: {
    gap: spacing[4],
  },
  settingBlock: {
    gap: spacing[2],
  },
  settingRow: {
    paddingHorizontal: spacing[4],
    gap: spacing[2],
  },
  settingLabel: {
    fontWeight: '700',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  stepperShell: {
    minHeight: 40,
    borderRadius: borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  stepperValue: {
    minWidth: 48,
    paddingHorizontal: spacing[3],
    fontWeight: '700',
  },
  stepperButtons: {
    flexDirection: 'row',
  },
  stepperButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ratingRow: {
    paddingHorizontal: spacing[4],
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    flexWrap: 'wrap',
  },
  switchGroup: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
