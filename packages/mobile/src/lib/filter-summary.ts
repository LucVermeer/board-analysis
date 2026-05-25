import type { TFunction } from 'i18next';
import type { Grade } from '@boardsesh/shared-schema';
import {
  getBaseFilterParts,
  formatFilterSummary,
  gradeAccuracyBucket,
  type FilterSummaryLabels,
  type SortOption,
} from '@boardsesh/climb-filters';
import { DEFAULT_FILTERS, type ClimbFilters } from './climb-filter-types';

function buildLabels(t: TFunction<'climbs'>): FilterSummaryLabels {
  return {
    gradeRange: (min, max) => t('mobile.search.gradeRange', { min, max }),
    gradeMin: (grade) => t('mobile.search.gradeMin', { grade }),
    gradeMax: (grade) => t('mobile.search.gradeMax', { grade }),
    ascents: (count) => t('mobile.search.ascents', { count }),
    rating: (count) => t('mobile.search.rating', { count }),
    more: (count) => t('mobile.search.more', { count }),
    // i18n-keep mobile.search.settersCount
    setters: (count) => t('mobile.search.settersCount', { count }),
    // i18n-keep mobile.filter.accuracy.off mobile.filter.accuracy.loose mobile.filter.accuracy.moderate mobile.filter.accuracy.tight
    gradeAccuracy: (value) => t(`mobile.filter.accuracy.${gradeAccuracyBucket(value)}`),
    tallOnly: () => t('mobile.filter.tall'),
    wideOnly: () => t('mobile.filter.wide'),
    // i18n-keep mobile.filter.status.drafts mobile.filter.status.established mobile.filter.status.projects
    status: (kind) => t(`mobile.filter.status.${kind}`),
    hideAttempted: () => t('mobile.filter.progress.hideAttempted'),
    hideCompleted: () => t('mobile.filter.progress.hideCompleted'),
    showOnlyAttempted: () => t('mobile.filter.progress.onlyAttempted'),
    showOnlyCompleted: () => t('mobile.filter.progress.onlyCompleted'),
  };
}

function buildSortLabel(t: TFunction<'climbs'>): (sortBy: string) => string | undefined {
  const sortLabels: Record<SortOption, string> = {
    ascents: t('mobile.filter.sort.ascents'),
    quality: t('mobile.filter.sort.quality'),
    difficulty: t('mobile.filter.sort.difficulty'),
    name: t('mobile.filter.sort.name'),
    popular: t('mobile.filter.sort.popular'),
    creation: t('mobile.filter.sort.creation'),
  };
  return (sortBy: string) => sortLabels[sortBy as SortOption];
}

export function getFilterSummary(
  filters: ClimbFilters,
  searchText: string,
  grades: Grade[] | undefined,
  t: TFunction<'climbs'>,
): string {
  const labels = buildLabels(t);
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
