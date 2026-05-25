import type { Grade } from '@boardsesh/shared-schema';
import { getGradeName } from './grade-lookup';

export type FilterSummaryLabels = {
  gradeRange: (min: string, max: string) => string;
  gradeMin: (grade: string) => string;
  gradeMax: (grade: string) => string;
  ascents: (count: number) => string;
  rating: (count: number) => string;
  more: (count: number) => string;
  // Optional — only emit a summary part when a label is supplied. Callers that
  // never set these fields can omit them.
  setters?: (count: number) => string;
  gradeAccuracy?: (value: string) => string;
  tallOnly?: () => string;
  wideOnly?: () => string;
  status?: (kind: 'drafts' | 'established' | 'projects') => string;
  hideAttempted?: () => string;
  hideCompleted?: () => string;
  showOnlyAttempted?: () => string;
  showOnlyCompleted?: () => string;
};

export type BaseFilters = {
  minGrade?: number;
  maxGrade?: number;
  minAscents?: number;
  minRating?: number;
  sortBy?: string;
  defaultSortBy?: string;
  name?: string;
  setter?: string[];
  gradeAccuracy?: string;
  onlyTallClimbs?: boolean;
  onlyWideClimbs?: boolean;
  status?: 'any' | 'drafts' | 'established' | 'projects';
  hideAttempted?: boolean;
  hideCompleted?: boolean;
  showOnlyAttempted?: boolean;
  showOnlyCompleted?: boolean;
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

  if (filters.setter != null && filters.setter.length > 0 && labels.setters) {
    parts.push(labels.setters(filters.setter.length));
  }

  if (filters.gradeAccuracy != null && labels.gradeAccuracy) {
    parts.push(labels.gradeAccuracy(filters.gradeAccuracy));
  }

  if (filters.onlyTallClimbs && labels.tallOnly) {
    parts.push(labels.tallOnly());
  }

  if (filters.onlyWideClimbs && labels.wideOnly) {
    parts.push(labels.wideOnly());
  }

  // 'any' is the catch-all default and 'established' overlaps the usual
  // "non-draft, non-project" result set — neither produces a part.
  if ((filters.status === 'drafts' || filters.status === 'projects') && labels.status) {
    parts.push(labels.status(filters.status));
  }

  if (filters.hideAttempted && labels.hideAttempted) {
    parts.push(labels.hideAttempted());
  }

  if (filters.hideCompleted && labels.hideCompleted) {
    parts.push(labels.hideCompleted());
  }

  if (filters.showOnlyAttempted && labels.showOnlyAttempted) {
    parts.push(labels.showOnlyAttempted());
  }

  if (filters.showOnlyCompleted && labels.showOnlyCompleted) {
    parts.push(labels.showOnlyCompleted());
  }

  return parts;
}

export function formatFilterSummary(
  parts: string[],
  labels: Pick<FilterSummaryLabels, 'more'>,
  maxParts: number | null = 2,
): string | null {
  if (parts.length === 0) return null;

  if (maxParts == null || parts.length <= maxParts) {
    return parts.join(' · ');
  }

  const remaining = parts.length - maxParts;
  return `${parts.slice(0, maxParts).join(' · ')} · ${labels.more(remaining)}`;
}
