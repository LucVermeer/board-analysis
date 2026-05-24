import type { Grade } from '@boardsesh/shared-schema';
import { getGradeName } from './grade-lookup';

export type FilterSummaryLabels = {
  gradeRange: (min: string, max: string) => string;
  gradeMin: (grade: string) => string;
  gradeMax: (grade: string) => string;
  ascents: (count: number) => string;
  rating: (count: number) => string;
  more: (count: number) => string;
  empty: string;
};

export type BaseFilters = {
  minGrade?: number;
  maxGrade?: number;
  minAscents?: number;
  minRating?: number;
  sortBy?: string;
  defaultSortBy?: string;
  name?: string;
};

export function getBaseFilterParts(
  filters: BaseFilters,
  grades: Grade[],
  labels: FilterSummaryLabels,
  sortLabel?: (sortBy: string) => string | undefined,
): string[] {
  const parts: string[] = [];

  if (filters.name && filters.name.length > 0) {
    parts.push(`"${filters.name}"`);
  }

  if (filters.minGrade != null && filters.maxGrade != null) {
    parts.push(labels.gradeRange(getGradeName(filters.minGrade, grades), getGradeName(filters.maxGrade, grades)));
  } else if (filters.minGrade != null) {
    parts.push(labels.gradeMin(getGradeName(filters.minGrade, grades)));
  } else if (filters.maxGrade != null) {
    parts.push(labels.gradeMax(getGradeName(filters.maxGrade, grades)));
  }

  if (filters.sortBy && filters.defaultSortBy && filters.sortBy !== filters.defaultSortBy && sortLabel) {
    const label = sortLabel(filters.sortBy);
    if (label) {
      parts.push(label);
    }
  }

  if (filters.minAscents != null) {
    parts.push(labels.ascents(filters.minAscents));
  }

  if (filters.minRating != null) {
    parts.push(labels.rating(filters.minRating));
  }

  return parts;
}

export function formatFilterSummary(
  parts: string[],
  labels: Pick<FilterSummaryLabels, 'more' | 'empty'>,
  maxParts = 2,
): string {
  if (parts.length === 0) return labels.empty;

  if (parts.length <= maxParts) {
    return parts.join(' · ');
  }

  const remaining = parts.length - maxParts;
  return `${parts.slice(0, maxParts).join(' · ')} · ${labels.more(remaining)}`;
}
