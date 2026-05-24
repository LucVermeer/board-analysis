import type { TFunction } from 'i18next';
import type { Grade } from '@boardsesh/shared-schema';
import { getBaseFilterParts, formatFilterSummary, type FilterSummaryLabels } from '@boardsesh/climb-filters';
import { DEFAULT_FILTERS, type ClimbFilters } from '../components/ClimbFilterSheet';

function buildLabels(t: TFunction<'climbs'>): FilterSummaryLabels {
  return {
    gradeRange: (min, max) => t('mobile.search.gradeRange', { min, max }),
    gradeMin: (grade) => t('mobile.search.gradeMin', { grade }),
    gradeMax: (grade) => t('mobile.search.gradeMax', { grade }),
    ascents: (count) => t('mobile.search.ascents', { count }),
    rating: (count) => t('mobile.search.rating', { count }),
    more: (count) => t('mobile.search.more', { count }),
    empty: t('mobile.filter.title'),
  };
}

function buildSortLabel(t: TFunction<'climbs'>): (sortBy: string) => string | undefined {
  const sortLabels: Record<string, string> = {
    popular: t('mobile.filter.popular'),
    quality: t('mobile.filter.quality'),
    difficulty: t('mobile.filter.difficulty'),
    newest: t('mobile.filter.newest'),
  };
  return (sortBy: string) => sortLabels[sortBy];
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
      minGrade: filters.minGrade,
      maxGrade: filters.maxGrade,
      minAscents: filters.minAscents,
      minRating: filters.minRating,
      sortBy: filters.sortBy,
      defaultSortBy: DEFAULT_FILTERS.sortBy,
      name: searchText,
    },
    grades ?? [],
    labels,
    buildSortLabel(t),
  );

  return formatFilterSummary(parts, labels);
}
