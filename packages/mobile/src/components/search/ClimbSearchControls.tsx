// The control row for the bottom-bar search layout (the floating card in the
// thumb zone): the grade pill, removable active-filter chips, the live result
// count, and the filters button with an active-count badge. Composed from the
// same glass parts the top search row uses (GradePill / ActiveFilterChips /
// FilterButton) so the two layouts never drift.

import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Grade } from '@boardsesh/shared-schema';
import type { ClimbBoardFilterState, GradeBound } from '@boardsesh/climb-filters';
import { Text } from '../Text';
import { useTheme } from '../../providers/theme-provider';
import { spacing } from '../../theme/tokens';
import type { ClimbFilters } from '../../lib/climb-filter-types';
import { GradePill } from './GradePill';
import { FilterButton } from './FilterButton';
import { ActiveFilterChips } from './ActiveFilterChips';

type ClimbSearchControlsProps = {
  bound: GradeBound;
  grades: readonly Grade[];
  filters: ClimbFilters;
  boardFilters: ClimbBoardFilterState;
  /** Result count for the active filter set; undefined while loading. */
  count: number | undefined;
  activeFilterCount: number;
  onOpenGrade: () => void;
  onOpenFilters: () => void;
  onPatchFilters: (patch: Partial<ClimbFilters>) => void;
  onPatchBoardFilters: (patch: Partial<ClimbBoardFilterState>) => void;
};

export function ClimbSearchControls({
  bound,
  grades,
  filters,
  boardFilters,
  count,
  activeFilterCount,
  onOpenGrade,
  onOpenFilters,
  onPatchFilters,
  onPatchBoardFilters,
}: ClimbSearchControlsProps) {
  const { t } = useTranslation('climbs');
  const { systemColors } = useTheme();

  return (
    <View style={styles.row}>
      <GradePill bound={bound} grades={grades} onPress={onOpenGrade} maxWidth={132} />

      <ActiveFilterChips
        filters={filters}
        boardFilters={boardFilters}
        onPatchFilters={onPatchFilters}
        onPatchBoardFilters={onPatchBoardFilters}
        style={styles.chipsScroll}
      />

      {count != null ? (
        <Text variant="caption1" color={systemColors.secondaryLabel} numberOfLines={1} style={styles.count}>
          {t('mobile.search.climbsCount', { count })}
        </Text>
      ) : null}

      <FilterButton activeFilterCount={activeFilterCount} onPress={onOpenFilters} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  chipsScroll: {
    flex: 1,
  },
  count: {
    flexShrink: 0,
  },
});
