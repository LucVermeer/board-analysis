import type { TFunction } from 'i18next';
import type { Grade } from '@boardsesh/shared-schema';
import { DEFAULT_FILTERS, type ClimbFilters } from '../components/ClimbFilterSheet';

function getGradeName(difficultyId: number, grades: Grade[]): string {
  const grade = grades.find((gradeEntry) => gradeEntry.difficultyId === difficultyId);
  return grade?.name ?? `#${difficultyId}`;
}

export function getFilterSummary(
  filters: ClimbFilters,
  searchText: string,
  grades: Grade[] | undefined,
  t: TFunction<'climbs'>,
): string {
  const parts: string[] = [];

  if (searchText.length > 0) {
    parts.push(`"${searchText}"`);
  }

  if (filters.minGrade != null && filters.maxGrade != null && grades) {
    parts.push(
      t('mobile.search.gradeRange', {
        min: getGradeName(filters.minGrade, grades),
        max: getGradeName(filters.maxGrade, grades),
      }),
    );
  } else if (filters.minGrade != null && grades) {
    parts.push(t('mobile.search.gradeMin', { grade: getGradeName(filters.minGrade, grades) }));
  } else if (filters.maxGrade != null && grades) {
    parts.push(t('mobile.search.gradeMax', { grade: getGradeName(filters.maxGrade, grades) }));
  }

  if (filters.sortBy !== DEFAULT_FILTERS.sortBy) {
    const sortLabels: Record<string, string> = {
      popular: t('mobile.filter.popular'),
      quality: t('mobile.filter.quality'),
      difficulty: t('mobile.filter.difficulty'),
      newest: t('mobile.filter.newest'),
    };
    const sortLabel = sortLabels[filters.sortBy];
    if (sortLabel) {
      parts.push(sortLabel);
    }
  }

  if (filters.minAscents != null) {
    parts.push(t('mobile.search.ascents', { count: filters.minAscents }));
  }

  if (filters.minRating != null) {
    parts.push(t('mobile.search.rating', { count: filters.minRating }));
  }

  if (parts.length === 0) {
    return t('mobile.filter.title');
  }

  if (parts.length <= 2) {
    return parts.join(' · ');
  }

  const remaining = parts.length - 2;
  return `${parts.slice(0, 2).join(' · ')} · ${t('mobile.search.more', { count: remaining })}`;
}
