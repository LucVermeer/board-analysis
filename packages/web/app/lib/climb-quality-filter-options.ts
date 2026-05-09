export const MIN_ASCENTS_FILTER_OPTIONS = [0, 1, 2, 5, 10, 25, 50, 100] as const;

export function normalizeMinAscentsFilter(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
}

export function getMinAscentsFilterOptions(value: number | null | undefined): number[] {
  const normalizedValue = normalizeMinAscentsFilter(value);
  if (normalizedValue === 0 || MIN_ASCENTS_FILTER_OPTIONS.some((option) => option === normalizedValue)) {
    return [...MIN_ASCENTS_FILTER_OPTIONS];
  }
  return [...MIN_ASCENTS_FILTER_OPTIONS, normalizedValue].sort((left, right) => left - right);
}

export function normalizeMinRatingFilter(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value) || value <= 0) return 0;
  return Math.min(5, Math.max(1, Math.ceil(value)));
}

export function getMinRatingPickerValue(value: number | null | undefined): number | null {
  const normalizedValue = normalizeMinRatingFilter(value);
  return normalizedValue === 0 ? null : normalizedValue;
}
