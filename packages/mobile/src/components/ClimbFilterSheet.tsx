import { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { View, Pressable, ScrollView, StyleSheet, type ViewStyle } from 'react-native';
import BottomSheet, { BottomSheetBackdrop, BottomSheetView, type BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import type { Grade } from '@boardsesh/shared-schema';
import { Text } from './Text';
import { Button } from './Button';
import { Separator } from './Separator';
import { SegmentedControl } from './SegmentedControl';
import { StarRating } from './StarRating';
import { useTheme } from '../providers/theme-provider';
import { useGrades } from '../lib/graphql/hooks';
import { hapticSelection } from '../lib/haptics';
import { springs } from '../theme/animations';
import { brandColors } from '../theme/colors';
import { iosSystemColors } from '../theme/ios-colors';
import { spacing } from '../theme/tokens';

export type ClimbFilters = {
  minGrade?: number;
  maxGrade?: number;
  minAscents?: number;
  minRating?: number;
  sortBy: string;
  sortOrder: string;
};

export const DEFAULT_FILTERS: ClimbFilters = {
  sortBy: 'popular',
  sortOrder: 'desc',
};

type ClimbFilterSheetProps = {
  visible: boolean;
  onDismiss: () => void;
  boardName: string;
  currentFilters: ClimbFilters;
  onApply: (filters: ClimbFilters) => void;
};

const SORT_OPTIONS = ['popular', 'quality', 'difficulty', 'newest'] as const;

const ASCENT_OPTIONS = [
  { label: 'any', value: undefined },
  { label: '5+', value: 5 },
  { label: '10+', value: 10 },
  { label: '25+', value: 25 },
  { label: '50+', value: 50 },
  { label: '100+', value: 100 },
] as const;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.95, springs.snappy);
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, springs.snappy);
  };

  const chipStyle: ViewStyle = {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: 20,
    borderWidth: 1,
    borderColor: selected ? brandColors.primary : 'rgba(60, 60, 67, 0.18)',
    backgroundColor: selected ? brandColors.primary : 'transparent',
  };

  return (
    <AnimatedPressable
      onPress={() => {
        hapticSelection();
        onPress();
      }}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={[animatedStyle, chipStyle]}
    >
      <Text variant="footnote" color={selected ? iosSystemColors.white : undefined} style={styles.chipText}>
        {label}
      </Text>
    </AnimatedPressable>
  );
}

function GradeSelector({
  label,
  grades,
  selectedDifficultyId,
  onSelect,
}: {
  label: string;
  grades: Grade[];
  selectedDifficultyId: number | undefined;
  onSelect: (difficultyId: number | undefined) => void;
}) {
  const chipStyle = (selected: boolean): ViewStyle => ({
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: 16,
    borderWidth: 1,
    borderColor: selected ? brandColors.primary : 'rgba(60, 60, 67, 0.18)',
    backgroundColor: selected ? brandColors.primary : 'transparent',
  });

  return (
    <View style={styles.gradeSelectorContainer}>
      <Text variant="footnote" style={styles.gradeSelectorLabel}>
        {label}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.gradeChipsRow}>
        {grades.map((grade) => {
          const selected = selectedDifficultyId === grade.difficultyId;
          return (
            <Pressable
              key={grade.difficultyId}
              onPress={() => {
                hapticSelection();
                onSelect(selected ? undefined : grade.difficultyId);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={grade.name}
            >
              <View style={chipStyle(selected)}>
                <Text variant="footnote" color={selected ? iosSystemColors.white : undefined} style={styles.chipText}>
                  {grade.name}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

export function hasActiveFilters(filters: ClimbFilters): boolean {
  return (
    filters.sortBy !== DEFAULT_FILTERS.sortBy ||
    filters.sortOrder !== DEFAULT_FILTERS.sortOrder ||
    filters.minGrade != null ||
    filters.maxGrade != null ||
    filters.minAscents != null ||
    filters.minRating != null
  );
}

export function ClimbFilterSheet({ visible, onDismiss, boardName, currentFilters, onApply }: ClimbFilterSheetProps) {
  const { t } = useTranslation('climbs');
  const theme = useTheme();
  const sheetRef = useRef<BottomSheet>(null);
  const { data: grades } = useGrades(boardName);

  const [localFilters, setLocalFilters] = useState<ClimbFilters>(currentFilters);

  useEffect(() => {
    if (visible) {
      setLocalFilters(currentFilters);
    }
  }, [visible, currentFilters]);

  const snapPoints = useMemo(() => ['80%'], []);

  const sortLabels: Record<string, string> = useMemo(
    () => ({
      popular: t('mobile.filter.popular'),
      quality: t('mobile.filter.quality'),
      difficulty: t('mobile.filter.difficulty'),
      newest: t('mobile.filter.newest'),
    }),
    [t],
  );

  const sortSegmentOptions = useMemo(
    () => SORT_OPTIONS.map((option) => ({ key: option, label: sortLabels[option] ?? option })),
    [sortLabels],
  );

  const handleSortChange = useCallback((sortBy: string) => {
    setLocalFilters((previous) => ({ ...previous, sortBy }));
  }, []);

  const handleMinGradeChange = useCallback((difficultyId: number | undefined) => {
    setLocalFilters((previous) => ({ ...previous, minGrade: difficultyId }));
  }, []);

  const handleMaxGradeChange = useCallback((difficultyId: number | undefined) => {
    setLocalFilters((previous) => ({ ...previous, maxGrade: difficultyId }));
  }, []);

  const handleMinAscentsChange = useCallback((value: number | undefined) => {
    setLocalFilters((previous) => ({ ...previous, minAscents: value }));
  }, []);

  const handleMinRatingChange = useCallback((value: number | undefined) => {
    setLocalFilters((previous) => ({ ...previous, minRating: value }));
  }, []);

  const handleApply = useCallback(() => {
    onApply(localFilters);
    sheetRef.current?.close();
  }, [localFilters, onApply]);

  const handleReset = useCallback(() => {
    hapticSelection();
    setLocalFilters(DEFAULT_FILTERS);
  }, []);

  const handleSheetChange = useCallback(
    (index: number) => {
      if (index === -1) {
        onDismiss();
      }
    },
    [onDismiss],
  );

  const renderBackdrop = useCallback(
    (backdropProps: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...backdropProps} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.4} />
    ),
    [],
  );

  const { systemColors } = theme;

  const backgroundStyle: ViewStyle = {
    backgroundColor: systemColors.secondaryBackground as string,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  };

  const trackColor = systemColors.fill;

  if (!visible) return null;

  return (
    <BottomSheet
      ref={sheetRef}
      index={0}
      snapPoints={snapPoints}
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      onChange={handleSheetChange}
      handleIndicatorStyle={styles.indicator}
      backgroundStyle={backgroundStyle}
    >
      <BottomSheetView style={styles.content}>
        <View style={styles.header}>
          <Text variant="title3">{t('mobile.filter.title')}</Text>
          <Pressable onPress={handleReset} hitSlop={8} accessibilityRole="button">
            <Text variant="subheadline" color={brandColors.primary}>
              {t('mobile.filter.reset')}
            </Text>
          </Pressable>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <View style={styles.section}>
            <Text variant="subheadline" style={styles.sectionLabel}>
              {t('mobile.filter.sortBy')}
            </Text>
            <SegmentedControl
              options={sortSegmentOptions}
              selectedKey={localFilters.sortBy}
              onSelect={handleSortChange}
              textVariant="footnote"
              trackColor={trackColor}
            />
          </View>

          <Separator />

          {grades && grades.length > 0 && (
            <>
              <View style={styles.section}>
                <Text variant="subheadline" style={styles.sectionLabel}>
                  {t('mobile.filter.gradeRange')}
                </Text>
                <GradeSelector
                  label={t('mobile.filter.minGrade')}
                  grades={grades}
                  selectedDifficultyId={localFilters.minGrade}
                  onSelect={handleMinGradeChange}
                />
                <View style={styles.gradeSpacer} />
                <GradeSelector
                  label={t('mobile.filter.maxGrade')}
                  grades={grades}
                  selectedDifficultyId={localFilters.maxGrade}
                  onSelect={handleMaxGradeChange}
                />
              </View>

              <Separator />
            </>
          )}

          <View style={styles.section}>
            <Text variant="subheadline" style={styles.sectionLabel}>
              {t('mobile.filter.minAscents')}
            </Text>
            <View style={styles.chipRow}>
              {ASCENT_OPTIONS.map((option) => (
                <Chip
                  key={option.label}
                  label={option.label === 'any' ? t('mobile.filter.anyAscents') : option.label}
                  selected={localFilters.minAscents === option.value}
                  onPress={() => handleMinAscentsChange(option.value)}
                />
              ))}
            </View>
          </View>

          <Separator />

          <View style={styles.section}>
            <Text variant="subheadline" style={styles.sectionLabel}>
              {t('mobile.filter.minRating')}
            </Text>
            <View style={styles.ratingRow}>
              <Pressable
                onPress={() => {
                  hapticSelection();
                  handleMinRatingChange(undefined);
                }}
                accessibilityRole="button"
              >
                <Text
                  variant="footnote"
                  color={localFilters.minRating == null ? brandColors.primary : undefined}
                  style={localFilters.minRating == null ? styles.chipTextSelected : styles.chipText}
                >
                  {t('mobile.filter.anyRating')}
                </Text>
              </Pressable>
              <StarRating value={localFilters.minRating} onChange={handleMinRatingChange} clearValue={undefined} />
            </View>
          </View>

          <View style={styles.applySection}>
            <Button
              title={t('mobile.filter.apply')}
              onPress={handleApply}
              variant="filled"
              size="large"
              style={styles.applyButton}
            />
          </View>
        </ScrollView>
      </BottomSheetView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  indicator: {
    backgroundColor: 'rgba(60, 60, 67, 0.3)',
    width: 36,
    height: 5,
    borderRadius: 3,
  },
  content: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[3],
  },
  scrollContent: {
    paddingBottom: spacing[10],
  },
  section: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  sectionLabel: {
    opacity: 0.6,
    marginBottom: spacing[2],
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  chipText: {
    fontWeight: '500',
  },
  chipTextSelected: {
    fontWeight: '600',
  },
  gradeSelectorContainer: {
    gap: spacing[1],
  },
  gradeSelectorLabel: {
    opacity: 0.5,
    marginBottom: spacing[1],
  },
  gradeChipsRow: {
    gap: spacing[2],
    paddingVertical: spacing[1],
  },
  gradeSpacer: {
    height: spacing[2],
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[4],
  },
  applySection: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[4],
  },
  applyButton: {
    width: '100%',
  },
});
