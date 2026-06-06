// The climb-list search row: a row of floating Liquid Glass controls pinned just
// below the status bar, with the list scrolling under them. Replaces the old
// nav-header search pill + the (header-occluded, unreachable) StickyFilterStrip.
//
// Layout: [🔍 glass search capsule] [grade] [filter] [＋ create]
//   - sticky-strip value: grade + filter live inline here; a second chips row
//     appears under the row only when filters are active.
//   - bottom-bar value: this row isn't rendered; that layout uses ClimbTopChrome
//     (board + create) up top and the thumb-zone SearchFab for search/grade/filter.
//
// The container is `box-none` so taps in the gaps fall through to the list; each
// control captures its own touches. It reports its measured height so the screen
// can pad the list to rest below it (handles the chips row appearing/vanishing).

import { type Ref, useCallback } from 'react';
import { Pressable, type LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { Grade } from '@boardsesh/shared-schema';
import type { GradeBound, ClimbBoardFilterState } from '@boardsesh/climb-filters';
import { useTheme } from '../../providers/theme-provider';
import { spacing } from '../../theme/tokens';
import { hapticLight } from '../../lib/haptics';
import type { ClimbFilters } from '../../lib/climb-filter-types';
import type { SearchLayout } from '../../lib/search-layout-preference';
import { SearchHeader, type SearchHeaderHandle } from '../SearchHeader';
import { GlassIconButton } from '../GlassIconButton';
import { GradePill } from './GradePill';
import { FilterButton } from './FilterButton';
import { ActiveFilterChips } from './ActiveFilterChips';
import { GradeRangeRail } from '../grade';

type ClimbSearchBarProps = {
  layout: SearchLayout;
  // Search field
  searchFieldRef: Ref<SearchHeaderHandle>;
  searchInitialValue: string;
  searchPlaceholder: string;
  onSearchChange: (text: string) => void;
  onSearchSubmit: (text: string) => void;
  onSearchFocus: () => void;
  onSearchBlur: () => void;
  // Grade + filter (rendered inline only in the sticky-strip layout)
  bound: GradeBound;
  grades: readonly Grade[];
  filters: ClimbFilters;
  boardFilters: ClimbBoardFilterState;
  activeFilterCount: number;
  gradeRailVisible: boolean;
  onOpenGrade: () => void;
  onCloseGrade: () => void;
  onGradeChange: (grade: GradeBound) => void;
  onOpenFilters: () => void;
  onPatchFilters: (patch: Partial<ClimbFilters>) => void;
  onPatchBoardFilters: (patch: Partial<ClimbBoardFilterState>) => void;
  // Create
  canCreate: boolean;
  onCreate: () => void;
  // Reports the bar's full height (incl. the top safe-area inset) so the list pads below it.
  onHeightChange: (height: number) => void;
};

export function ClimbSearchBar({
  layout,
  searchFieldRef,
  searchInitialValue,
  searchPlaceholder,
  onSearchChange,
  onSearchSubmit,
  onSearchFocus,
  onSearchBlur,
  bound,
  grades,
  filters,
  boardFilters,
  activeFilterCount,
  gradeRailVisible,
  onOpenGrade,
  onCloseGrade,
  onGradeChange,
  onOpenFilters,
  onPatchFilters,
  onPatchBoardFilters,
  canCreate,
  onCreate,
  onHeightChange,
}: ClimbSearchBarProps) {
  const { t } = useTranslation('climbs');
  const { systemColors } = useTheme();
  const insets = useSafeAreaInsets();
  const showControls = layout === 'sticky-strip';
  const filtersActive = activeFilterCount > 0;

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => onHeightChange(event.nativeEvent.layout.height),
    [onHeightChange],
  );

  const handleCreate = useCallback(() => {
    hapticLight();
    onCreate();
  }, [onCreate]);

  const handleGradePress = useCallback(() => {
    hapticLight();
    if (gradeRailVisible) {
      onCloseGrade();
    } else {
      onOpenGrade();
    }
  }, [gradeRailVisible, onCloseGrade, onOpenGrade]);

  return (
    <View pointerEvents="box-none" style={styles.container}>
      {showControls && gradeRailVisible ? (
        <Pressable
          style={styles.dismissLayer}
          onPress={onCloseGrade}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      ) : null}
      <View pointerEvents="box-none" style={[styles.chrome, { paddingTop: insets.top }]} onLayout={handleLayout}>
        <View pointerEvents="box-none" style={styles.row}>
          {canCreate ? (
            <GlassIconButton
              iconName="plus"
              iconColor={systemColors.label as string}
              onPress={handleCreate}
              accessibilityLabel={t('mobile.create.fab.ariaLabel')}
              fallbackColor={systemColors.fill}
            />
          ) : null}

          <SearchHeader
            ref={searchFieldRef}
            initialValue={searchInitialValue}
            placeholder={searchPlaceholder}
            onChangeText={onSearchChange}
            onSubmit={onSearchSubmit}
            onFocus={onSearchFocus}
            onBlur={onSearchBlur}
          />

          {showControls ? (
            <GradePill
              bound={bound}
              grades={grades}
              onPress={handleGradePress}
              expanded={gradeRailVisible}
              maxWidth={132}
            />
          ) : null}

          {showControls ? <FilterButton activeFilterCount={activeFilterCount} onPress={onOpenFilters} /> : null}
        </View>

        {showControls && gradeRailVisible ? (
          <GradeRangeRail
            grades={grades}
            bound={bound}
            onChange={onGradeChange}
            onRequestClose={onCloseGrade}
            style={styles.gradeRail}
          />
        ) : null}

        {showControls && filtersActive ? (
          <ActiveFilterChips
            filters={filters}
            boardFilters={boardFilters}
            onPatchFilters={onPatchFilters}
            onPatchBoardFilters={onPatchBoardFilters}
            style={styles.chipsRow}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
  },
  dismissLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    // Below the chrome (zIndex 1) so taps on the grade rail / row reach their
    // controls; this layer only catches taps in the empty area to dismiss.
    zIndex: 0,
  },
  chrome: {
    zIndex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
  },
  chipsRow: {
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[2],
  },
  gradeRail: {
    marginHorizontal: spacing[4],
    marginBottom: spacing[2],
  },
});
