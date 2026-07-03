import { describe, expect, it } from 'vitest';

import { convertQuality, convertQualityToAurora, normalizeQualityTo5 } from '../utils';

void describe('normalizeQualityTo5', () => {
  it('scales a 1-3 average onto 1-5 (×5/3, continuous)', () => {
    expect(normalizeQualityTo5(3)).toBeCloseTo(5);
    expect(normalizeQualityTo5(1)).toBeCloseTo(5 / 3);
    expect(normalizeQualityTo5(2.79)).toBeCloseTo(4.65, 2); // a real averaged value
  });

  it('treats unrated (null/≤0) as null, never 0', () => {
    expect(normalizeQualityTo5(null)).toBeNull();
    expect(normalizeQualityTo5(undefined)).toBeNull();
    expect(normalizeQualityTo5(0)).toBeNull();
  });

  it('does not round — averages stay continuous (unlike convertQuality)', () => {
    expect(normalizeQualityTo5(1.5)).toBeCloseTo(2.5);
    expect(convertQuality(1.5)).toBe(2); // convertQuality rounds a single rating
    expect(normalizeQualityTo5(1.5)).not.toBe(convertQuality(1.5));
  });
});

void describe('convertQualityToAurora', () => {
  it('maps the Boardsesh 1-5 scale onto Aurora 1-3', () => {
    expect(convertQualityToAurora(1)).toBe(1);
    expect(convertQualityToAurora(2)).toBe(2);
    expect(convertQualityToAurora(3)).toBe(2);
    expect(convertQualityToAurora(4)).toBe(3);
    expect(convertQualityToAurora(5)).toBe(3);
  });

  it('treats unrated (null/≤0/non-finite) as null', () => {
    expect(convertQualityToAurora(null)).toBeNull();
    expect(convertQualityToAurora(undefined)).toBeNull();
    expect(convertQualityToAurora(0)).toBeNull();
    expect(convertQualityToAurora(Number.NaN)).toBeNull();
  });

  it('clamps out-of-range input to the 1-5 domain', () => {
    expect(convertQualityToAurora(7)).toBe(3);
    expect(convertQualityToAurora(0.5)).toBe(1);
  });

  it('round-trips every Aurora rating through convertQuality', () => {
    for (const auroraRating of [1, 2, 3]) {
      expect(convertQualityToAurora(convertQuality(auroraRating))).toBe(auroraRating);
    }
  });
});
