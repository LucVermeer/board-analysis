import { describe, it, expect } from 'vitest';
import type { ClimbStatsHistoryEntry } from '@boardsesh/graphql/operations';
import { buildAngleGradeBars } from '../community-utils';

function makeEntry(overrides: Partial<ClimbStatsHistoryEntry> = {}): ClimbStatsHistoryEntry {
  return {
    angle: 40,
    ascensionistCount: 10,
    qualityAverage: 2.5,
    difficultyAverage: 20,
    displayDifficulty: 20,
    createdAt: '2026-01-01',
    ...overrides,
  };
}

describe('buildAngleGradeBars', () => {
  it('returns an empty array for undefined history', () => {
    expect(buildAngleGradeBars(undefined, 'v-grade')).toEqual([]);
  });

  it('maps difficulty id to a V-grade label and sorts by angle', () => {
    const bars = buildAngleGradeBars(
      [makeEntry({ angle: 50, displayDifficulty: 22 }), makeEntry({ angle: 40, displayDifficulty: 20 })],
      'v-grade',
    );
    expect(bars.map((bar) => bar.angle)).toEqual([40, 50]);
    expect(bars.map((bar) => bar.gradeName)).toEqual(['V5', 'V6']);
  });

  it('uses font labels when requested', () => {
    const bars = buildAngleGradeBars([makeEntry({ displayDifficulty: 20 })], 'font');
    expect(bars[0].gradeName).toBe('6C');
  });

  it('uses combined labels when requested', () => {
    const bars = buildAngleGradeBars([makeEntry({ displayDifficulty: 21 })], 'both');
    expect(bars[0].gradeName).toBe('V5+ / 6C+');
  });

  it('keeps only the latest snapshot per angle', () => {
    const bars = buildAngleGradeBars(
      [
        makeEntry({ angle: 40, displayDifficulty: 18, createdAt: '2026-01-01' }),
        makeEntry({ angle: 40, displayDifficulty: 22, createdAt: '2026-03-01' }),
      ],
      'v-grade',
    );
    expect(bars).toHaveLength(1);
    expect(bars[0].difficulty).toBe(22);
    expect(bars[0].gradeName).toBe('V6');
  });

  it('falls back to displayDifficulty over difficultyAverage, then skips null difficulties', () => {
    const bars = buildAngleGradeBars(
      [
        makeEntry({ angle: 40, displayDifficulty: null, difficultyAverage: 20 }),
        makeEntry({ angle: 45, displayDifficulty: null, difficultyAverage: null }),
      ],
      'v-grade',
    );
    expect(bars.map((bar) => bar.angle)).toEqual([40]);
    expect(bars[0].difficulty).toBe(20);
  });

  it('labels out-of-range difficulties with the rounded numeric value', () => {
    const bars = buildAngleGradeBars([makeEntry({ displayDifficulty: 99.4 })], 'v-grade');
    expect(bars[0].gradeName).toBe('99');
  });
});
