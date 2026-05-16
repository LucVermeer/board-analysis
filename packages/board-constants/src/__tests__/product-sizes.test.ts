import { describe, expect, it } from 'vite-plus/test';
import { isKilterHomewallTallSizeId, isKilterHomewallWideSizeId } from '../product-sizes';

describe('Kilter Homewall size filter capabilities', () => {
  it('marks 8x12 and 10x12 Homewall sizes as tall-capable', () => {
    for (const sizeId of [23, 24, 25, 26]) {
      expect(isKilterHomewallTallSizeId(sizeId)).toBe(true);
    }
  });

  it('does not mark 10-high Homewall sizes as tall-capable', () => {
    for (const sizeId of [17, 18, 21, 22, 29]) {
      expect(isKilterHomewallTallSizeId(sizeId)).toBe(false);
    }
  });

  it('keeps 8x12 Homewall sizes out of the wide-climbs filter', () => {
    for (const sizeId of [23, 24]) {
      expect(isKilterHomewallWideSizeId(sizeId)).toBe(false);
    }
  });
});
