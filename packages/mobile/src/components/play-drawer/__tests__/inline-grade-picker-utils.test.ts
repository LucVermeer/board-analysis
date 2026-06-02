import { describe, it, expect } from 'vitest';
import { computeFocusOffset } from '../inline-grade-picker-utils';

describe('computeFocusOffset', () => {
  it('returns null when the viewport width has not been measured yet', () => {
    expect(
      computeFocusOffset({
        viewportWidth: 0,
        chipLayout: { x: 200, width: 56 },
        index: 5,
        approxChipWidth: 56,
      }),
    ).toBeNull();
  });

  it('centers the focus chip within the viewport when its layout is known', () => {
    // Chip at x=200 with width=56, viewport=320 → center the chip's midpoint
    // (228) in the viewport → scrollX = 228 - 160 = 68.
    expect(
      computeFocusOffset({
        viewportWidth: 320,
        chipLayout: { x: 200, width: 56 },
        index: 5,
        approxChipWidth: 56,
      }),
    ).toBe(68);
  });

  it('clamps to zero when the focus chip is already near the left edge', () => {
    // A chip at x=10 in a 320-wide viewport would otherwise resolve to a
    // negative scroll offset; ScrollViews refuse those, so the helper
    // clamps to zero.
    expect(
      computeFocusOffset({
        viewportWidth: 320,
        chipLayout: { x: 10, width: 40 },
        index: 0,
        approxChipWidth: 56,
      }),
    ).toBe(0);
  });

  it('falls back to index * approxChipWidth before onLayout has fired', () => {
    // Without measured layout the helper assumes uniform-width chips so it
    // can still scroll on the first paint. Index 5 × 56 = 280 → centered in
    // a 320 viewport: 280 - 160 + 28 = 148.
    expect(
      computeFocusOffset({
        viewportWidth: 320,
        chipLayout: null,
        index: 5,
        approxChipWidth: 56,
      }),
    ).toBe(148);
  });
});
