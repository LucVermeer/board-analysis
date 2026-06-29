import { describe, it, expect } from 'vitest';
import {
  computeMarqueeDurationS,
  MARQUEE_MIN_DURATION_S,
  MARQUEE_MAX_DURATION_S,
  MARQUEE_PIXELS_PER_SECOND,
} from '../marquee-timing';

describe('computeMarqueeDurationS', () => {
  it('returns 0 when nothing overflows', () => {
    expect(computeMarqueeDurationS(0)).toBe(0);
    expect(computeMarqueeDurationS(-50)).toBe(0);
  });

  it('floors a small overflow at the minimum duration', () => {
    // overflow/30 + 6 = 7s for 30px, below the 8s floor.
    expect(computeMarqueeDurationS(30)).toBe(MARQUEE_MIN_DURATION_S);
  });

  it('caps a huge overflow at the maximum duration', () => {
    expect(computeMarqueeDurationS(10_000)).toBe(MARQUEE_MAX_DURATION_S);
  });

  it('follows overflow/speed + 6 in the mid range', () => {
    const overflowPx = 300;
    expect(computeMarqueeDurationS(overflowPx)).toBeCloseTo(overflowPx / MARQUEE_PIXELS_PER_SECOND + 6);
  });
});
