// The climb-list search row: a row of floating Liquid Glass controls pinned just
// below the status bar, with the list scrolling under them. Replaces the old
// nav-header search pill + the (header-occluded, unreachable) StickyFilterStrip.
//
// Layout: [＋ create] [🔍 glass search capsule]
//   - bottom-bar value: this row isn't rendered; that layout uses ClimbTopChrome
//     for board, create, lightbulb, and search/grade/filter.
//
// The container is `box-none` so taps in the gaps fall through to the list; each
// control captures its own touches. It reports its measured height so the screen
// can pad the list to rest below it (handles the chips row appearing/vanishing).

import { type Ref, useCallback } from 'react';
import { type LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { ClimbBoardFilterState } from '@boardsesh/climb-filters';
import { useTheme } from '../../providers/theme-provider';
import { spacing } from '../../theme/tokens';
import { hapticLight } from '../../lib/haptics';
import type { ClimbFilters } from '../../lib/climb-filter-types';
import type { SearchLayout } from '../../lib/search-layout-preference';
import { SearchHeader, type SearchHeaderHandle } from '../SearchHeader';
import { GlassIconButton } from '../GlassIconButton';
import { ActiveFilterChips } from './ActiveFilterChips';

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
  filters: ClimbFilters;
  boardFilters: ClimbBoardFilterState;
  activeFilterCount: number;
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
  filters,
  boardFilters,
  activeFilterCount,
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

  return (
    <View pointerEvents="box-none" style={styles.container}>
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

          <View pointerEvents="box-none" style={styles.searchSlot}>
            <SearchHeader
              ref={searchFieldRef}
              initialValue={searchInitialValue}
              placeholder={searchPlaceholder}
              onChangeText={onSearchChange}
              onSubmit={onSearchSubmit}
              onFocus={onSearchFocus}
              onBlur={onSearchBlur}
            />
          </View>
        </View>

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
  chrome: {
    zIndex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
  },
  searchSlot: {
    flex: 1,
    minWidth: 0,
  },
  chipsRow: {
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[2],
  },
});
