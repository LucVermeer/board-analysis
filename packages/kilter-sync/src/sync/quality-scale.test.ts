import { describe, it, expect } from 'vitest';

import { correctGripsQualityAverage } from './quality-scale';

const PRE = '2024-03-15 12:00:00'; // before the 2025-09-01 Grips cutover
const POST = '2026-01-10 09:30:00'; // after the cutover

describe('correctGripsQualityAverage', () => {
  it('maps a pre-cutover Aurora-era average onto 1-5 with 2q−1', () => {
    expect(correctGripsQualityAverage(3.0, PRE)).toBe(5.0); // classic 3-of-3 → 5-of-5
    expect(correctGripsQualityAverage(2.0, PRE)).toBe(3.0);
    expect(correctGripsQualityAverage(1.0, PRE)).toBe(1.0);
    expect(correctGripsQualityAverage(2.5, PRE)).toBe(4.0); // continuous average
  });

  it('clamps a pre-cutover average to the 1-5 range', () => {
    // A blended pre-cutover value above 3 over-converts, then clamps to 5.
    expect(correctGripsQualityAverage(3.5, PRE)).toBe(5.0);
  });

  it('passes a post-cutover average through unchanged (already native 1-5)', () => {
    expect(correctGripsQualityAverage(3.25, POST)).toBe(3.25);
    expect(correctGripsQualityAverage(5.0, POST)).toBe(5.0);
    expect(correctGripsQualityAverage(1.0, POST)).toBe(1.0);
  });

  it('passes through when the era is unknown (null / unparseable timestamp)', () => {
    expect(correctGripsQualityAverage(4.2, null)).toBe(4.2);
    expect(correctGripsQualityAverage(4.2, 'not-a-date')).toBe(4.2);
  });

  it('treats unrated (null / undefined / ≤ 0 / non-finite) as null', () => {
    expect(correctGripsQualityAverage(null, PRE)).toBeNull();
    expect(correctGripsQualityAverage(undefined, PRE)).toBeNull();
    expect(correctGripsQualityAverage(0, PRE)).toBeNull();
    expect(correctGripsQualityAverage(0, POST)).toBeNull();
    expect(correctGripsQualityAverage(-1, PRE)).toBeNull();
    expect(correctGripsQualityAverage(Number.NaN, POST)).toBeNull();
  });
});
