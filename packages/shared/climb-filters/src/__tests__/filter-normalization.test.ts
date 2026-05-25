import { describe, it, expect } from 'vitest';
import {
  normalizeMinAscentsFilter,
  normalizeMinRatingFilter,
  formatMinAscentsFilterCount,
  getMinRatingPickerValue,
  gradeAccuracyBucket,
} from '../filter-normalization';

describe('normalizeMinAscentsFilter', () => {
  it('returns 0 for null/undefined', () => {
    expect(normalizeMinAscentsFilter(null)).toBe(0);
    expect(normalizeMinAscentsFilter(undefined)).toBe(0);
  });

  it('returns 0 for non-positive values', () => {
    expect(normalizeMinAscentsFilter(0)).toBe(0);
    expect(normalizeMinAscentsFilter(-5)).toBe(0);
  });

  it('floors positive values', () => {
    expect(normalizeMinAscentsFilter(10.7)).toBe(10);
    expect(normalizeMinAscentsFilter(100)).toBe(100);
  });

  it('returns 0 for NaN/Infinity', () => {
    expect(normalizeMinAscentsFilter(NaN)).toBe(0);
    expect(normalizeMinAscentsFilter(Infinity)).toBe(0);
  });
});

describe('normalizeMinRatingFilter', () => {
  it('returns 0 for null/undefined', () => {
    expect(normalizeMinRatingFilter(null)).toBe(0);
    expect(normalizeMinRatingFilter(undefined)).toBe(0);
  });

  it('clamps to 1-5 range', () => {
    expect(normalizeMinRatingFilter(0.5)).toBe(1);
    expect(normalizeMinRatingFilter(3)).toBe(3);
    expect(normalizeMinRatingFilter(6)).toBe(5);
  });

  it('ceils fractional values', () => {
    expect(normalizeMinRatingFilter(2.3)).toBe(3);
    expect(normalizeMinRatingFilter(4.1)).toBe(5);
  });
});

describe('formatMinAscentsFilterCount', () => {
  it('formats values below 1000 as plain numbers', () => {
    expect(formatMinAscentsFilterCount(0)).toBe('0');
    expect(formatMinAscentsFilterCount(10)).toBe('10');
    expect(formatMinAscentsFilterCount(100)).toBe('100');
  });

  it('formats thousands with k suffix', () => {
    expect(formatMinAscentsFilterCount(1000)).toBe('1k');
    expect(formatMinAscentsFilterCount(10000)).toBe('10k');
  });

  it('falls back to plain number for non-round thousands', () => {
    expect(formatMinAscentsFilterCount(1500)).toBe('1500');
    expect(formatMinAscentsFilterCount(2500)).toBe('2500');
  });
});

describe('getMinRatingPickerValue', () => {
  it('returns null for zero/null/undefined', () => {
    expect(getMinRatingPickerValue(0)).toBeNull();
    expect(getMinRatingPickerValue(null)).toBeNull();
    expect(getMinRatingPickerValue(undefined)).toBeNull();
  });

  it('returns normalized value for positive input', () => {
    expect(getMinRatingPickerValue(3)).toBe(3);
    expect(getMinRatingPickerValue(5)).toBe(5);
  });
});

describe('gradeAccuracyBucket', () => {
  it('maps wire values to UX buckets', () => {
    expect(gradeAccuracyBucket('0')).toBe('off');
    expect(gradeAccuracyBucket('0.2')).toBe('loose');
    expect(gradeAccuracyBucket('0.1')).toBe('moderate');
    expect(gradeAccuracyBucket('0.05')).toBe('tight');
  });

  it('treats null and undefined as off', () => {
    expect(gradeAccuracyBucket(null)).toBe('off');
    expect(gradeAccuracyBucket(undefined)).toBe('off');
  });
});
