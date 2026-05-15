import { describe, expect, it } from 'vite-plus/test';
import { stableStringify } from '../stable-json';

describe('stableStringify', () => {
  it('emits the same bytes for objects with the same values in different insertion orders', () => {
    const firstPlacementMap = {
      tension: { '1-10': { 12: 101, 2: 20 }, '1-2': { 9: 90, 1: 10 } },
      kilter: { '7-12': { b: 2, a: 1 } },
    };
    const secondPlacementMap = {
      kilter: { '7-12': { a: 1, b: 2 } },
      tension: { '1-2': { 1: 10, 9: 90 }, '1-10': { 2: 20, 12: 101 } },
    };

    expect(stableStringify(firstPlacementMap)).toBe(stableStringify(secondPlacementMap));
  });

  it('sorts nested object keys naturally while preserving array order', () => {
    const placementMap = {
      board: {
        '1-10': [{ z: 3, y: 2 }],
        '1-2': [{ b: 1, a: 0 }],
      },
    };

    expect(stableStringify(placementMap)).toBe('{"board":{"1-2":[{"a":0,"b":1}],"1-10":[{"y":2,"z":3}]}}');
  });
});
