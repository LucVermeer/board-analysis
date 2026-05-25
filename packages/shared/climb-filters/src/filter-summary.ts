import type { Grade } from '@boardsesh/shared-schema';
import { getGradeName } from './grade-lookup';

export type FilterSummaryLabels = {
  gradeRange: (min: string, max: string) => string;
  gradeMin: (grade: string) => string;
  gradeMax: (grade: string) => string;
  ascents: (count: number) => string;
  rating: (count: number) => string;
  more: (count: number) => string;
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

// Web suppresses minAscents >= 2 when the "Established" status chip is active
// (see getQualityPanelSummary in search-summary-utils.ts). This shared function
// does not apply that dedup — web callers should filter parts before formatting.
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
  labels: Pick<FilterSummaryLabels, 'more'>,
  maxParts?: number | null,
): string | null {
  if (parts.length === 0) return null;

  if (maxParts == null || parts.length <= maxParts) {
    return parts.join(' · ');
  }

  const remaining = parts.length - maxParts;
  return `${parts.slice(0, maxParts).join(' · ')} · ${labels.more(remaining)}`;
}
