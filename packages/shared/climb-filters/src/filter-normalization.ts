export const MIN_ASCENTS_FILTER_OPTIONS = [0, 1, 10, 100, 1000, 10000] as const;

export function normalizeMinAscentsFilter(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
}

export function getMinAscentsFilterOptions(): number[] {
  return [...MIN_ASCENTS_FILTER_OPTIONS];
}

export function formatMinAscentsFilterCount(value: number): string {
  const normalizedValue = normalizeMinAscentsFilter(value);
  if (normalizedValue >= 1000 && normalizedValue % 1000 === 0) {
    return `${normalizedValue / 1000}k`;
  }
  return String(normalizedValue);
}

export function normalizeMinRatingFilter(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value) || value <= 0) return 0;
  return Math.min(5, Math.max(1, Math.ceil(value)));
}

export function getMinRatingPickerValue(value: number | null | undefined): number | null {
  const normalizedValue = normalizeMinRatingFilter(value);
  return normalizedValue === 0 ? null : normalizedValue;
}

export type GradeAccuracyBucket = 'off' | 'loose' | 'moderate' | 'tight';

/**
 * Maps the grade-accuracy wire value (`'0' | '0.05' | '0.1' | '0.2'`) to a
 * UX bucket name. Used by both the picker label lookup and the filter
 * summary text.
 */
export function gradeAccuracyBucket(value: string | null | undefined): GradeAccuracyBucket {
  if (value == null || value === '0') return 'off';
  if (value === '0.2') return 'loose';
  if (value === '0.1') return 'moderate';
  return 'tight';
}
