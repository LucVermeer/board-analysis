import type { TFunction } from 'i18next';
import type { Grade } from '@boardsesh/shared-schema';
import { getBaseFilterParts, formatFilterSummary } from '@boardsesh/climb-filters';
import { DEFAULT_FILTERS, type ClimbFilters } from './climb-filter-types';
import { buildFilterLabels, buildSortLabel } from './filter-labels';

export function getFilterSummary(
  filters: ClimbFilters,
  searchText: string,
  grades: Grade[] | undefined,
  t: TFunction<'climbs'>,
): string {
  const labels = buildFilterLabels(t);
  const parts = getBaseFilterParts(
    {
      // Only include grade bounds when grades data is available — without it
      // getGradeName falls back to "#N" which is uninformative to the user.
      minGrade: grades != null ? filters.minGrade : undefined,
      maxGrade: grades != null ? filters.maxGrade : undefined,
      minAscents: filters.minAscents,
      minRating: filters.minRating,
      sortBy: filters.sortBy,
      defaultSortBy: DEFAULT_FILTERS.sortBy,
      name: searchText,
      setter: filters.setter,
      gradeAccuracy: filters.gradeAccuracy,
      onlyTallClimbs: filters.onlyTallClimbs,
      onlyWideClimbs: filters.onlyWideClimbs,
      onlyWithBetaVideos: filters.onlyWithBetaVideos,
      status: filters.status,
      hideAttempted: filters.hideAttempted,
      hideCompleted: filters.hideCompleted,
      showOnlyAttempted: filters.showOnlyAttempted,
      showOnlyCompleted: filters.showOnlyCompleted,
    },
    grades ?? [],
    labels,
    buildSortLabel(t),
  );

  return formatFilterSummary(parts, labels) ?? t('mobile.filter.title');
}
