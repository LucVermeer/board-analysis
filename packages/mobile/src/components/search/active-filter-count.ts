import { DEFAULT_CLIMB_FILTER_STATE } from '@boardsesh/climb-filters';
import type { ClimbFilters } from '../../lib/climb-filter-types';

/**
 * Count of active filters *beyond grade* — grade has its own pill, so the gear
 * badge should mean "extra refinements are on". Sort counts as one when it
 * differs from the default. (P1 will surface these as removable pills; for now
 * this drives the badge.)
 */
export function countActiveFiltersBeyondGrade(filters: ClimbFilters): number {
  let count = 0;
  if (filters.setter && filters.setter.length > 0) count += 1;
  if (filters.minAscents != null) count += 1;
  if (filters.minRating != null) count += 1;
  if (filters.gradeAccuracy != null) count += 1;
  if (filters.status !== DEFAULT_CLIMB_FILTER_STATE.status) count += 1;
  if (filters.onlyTallClimbs) count += 1;
  if (filters.onlyWideClimbs) count += 1;
  if (filters.onlyWithBetaVideos) count += 1;
  if (filters.hideAttempted) count += 1;
  if (filters.hideCompleted) count += 1;
  if (filters.showOnlyAttempted) count += 1;
  if (filters.showOnlyCompleted) count += 1;
  if (
    filters.sortBy !== DEFAULT_CLIMB_FILTER_STATE.sortBy ||
    filters.sortOrder !== DEFAULT_CLIMB_FILTER_STATE.sortOrder
  ) {
    count += 1;
  }
  return count;
}
