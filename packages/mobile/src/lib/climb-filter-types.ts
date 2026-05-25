// Re-export the canonical filter state from the shared package so mobile
// callers and the existing `ClimbFilters` / `DEFAULT_FILTERS` symbols
// continue to work without churn.
import { type ClimbFilterState, DEFAULT_CLIMB_FILTER_STATE, type SortOption } from '@boardsesh/climb-filters';

export type ClimbFilters = ClimbFilterState;

export const DEFAULT_FILTERS: ClimbFilters = DEFAULT_CLIMB_FILTER_STATE;

export type { SortOption };
