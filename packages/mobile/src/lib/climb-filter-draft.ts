import type { ClimbBoardFilterState } from '@boardsesh/climb-filters';
import type { HoldsFilter } from '@boardsesh/shared-schema';
import type { ClimbFilters } from './climb-filter-types';
import type { ZoneFilterSelection } from './zone-filter-handoff';

export type ClimbFilterDraft = {
  filters: ClimbFilters;
  boardFilters: ClimbBoardFilterState;
};

export function createClimbFilterDraft(filters: ClimbFilters, boardFilters: ClimbBoardFilterState): ClimbFilterDraft {
  return { filters, boardFilters };
}

export function applySetterSelectionToFilterDraft(
  draft: ClimbFilterDraft,
  selectedSetters: string[],
): ClimbFilterDraft {
  return {
    filters: { ...draft.filters, setter: selectedSetters.length > 0 ? selectedSetters : undefined },
    boardFilters: draft.boardFilters,
  };
}

export function applyHoldsFilterSelectionToFilterDraft(
  draft: ClimbFilterDraft,
  holdsFilter: HoldsFilter,
): ClimbFilterDraft {
  return {
    filters: draft.filters,
    boardFilters: {
      ...draft.boardFilters,
      holdsFilter: Object.keys(holdsFilter).length > 0 ? holdsFilter : undefined,
    },
  };
}

export function applyZoneFilterSelectionToFilterDraft(
  draft: ClimbFilterDraft,
  zoneSelection: ZoneFilterSelection,
): ClimbFilterDraft {
  const boardFilters: ClimbBoardFilterState = {
    ...draft.boardFilters,
    zoneBox: zoneSelection.zoneBox,
    zoneMode: zoneSelection.zoneBox ? zoneSelection.zoneMode : undefined,
  };

  if (zoneSelection.holdsFilter !== undefined) {
    boardFilters.holdsFilter =
      Object.keys(zoneSelection.holdsFilter).length > 0 ? zoneSelection.holdsFilter : undefined;
  }

  return { filters: draft.filters, boardFilters };
}
