import { describe, it, expect } from 'vitest';
import type { Climb } from '@boardsesh/shared-schema';
import { accumulateClimbs } from '../climb-pagination';

// ── Factory helper ──────────────────────────────────────────────────────

function makeClimb(uuid: string, name = `Climb ${uuid}`): Climb {
  return {
    uuid,
    name,
    frames: '',
    setter_username: 'setter',
    angle: 40,
    ascensionist_count: 5,
    difficulty: 'V3',
    quality_average: '3.0',
    stars: 3,
    difficulty_error: '0.3',
    benchmark_difficulty: null,
  };
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('accumulateClimbs', () => {
  it('page 1 replaces all existing climbs', () => {
    const existing = [makeClimb('old-1'), makeClimb('old-2')];
    const fresh = [makeClimb('new-1'), makeClimb('new-2'), makeClimb('new-3')];

    const result = accumulateClimbs(existing, fresh, 1);

    expect(result).toHaveLength(3);
    expect(result).toBe(fresh); // exact same array reference
  });

  it('page 2+ appends only new climbs', () => {
    const existing = [makeClimb('a'), makeClimb('b')];
    const nextPage = [makeClimb('c'), makeClimb('d')];

    const result = accumulateClimbs(existing, nextPage, 2);

    expect(result).toHaveLength(4);
    expect(result.map((climb) => climb.uuid)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('filters out duplicates (same UUID) on page 2+', () => {
    const existing = [makeClimb('a'), makeClimb('b')];
    // 'b' already exists, 'c' is new
    const nextPage = [makeClimb('b'), makeClimb('c')];

    const result = accumulateClimbs(existing, nextPage, 2);

    expect(result).toHaveLength(3);
    expect(result.map((climb) => climb.uuid)).toEqual(['a', 'b', 'c']);
  });

  it('handles empty new results on page 2+', () => {
    const existing = [makeClimb('a'), makeClimb('b')];

    const result = accumulateClimbs(existing, [], 2);

    expect(result).toHaveLength(2);
    expect(result.map((climb) => climb.uuid)).toEqual(['a', 'b']);
  });

  it('handles empty existing list with new results on page 2+', () => {
    const newClimbs = [makeClimb('x'), makeClimb('y')];

    const result = accumulateClimbs([], newClimbs, 2);

    expect(result).toHaveLength(2);
    expect(result.map((climb) => climb.uuid)).toEqual(['x', 'y']);
  });

  it('handles all duplicates on page 2+ (no new items)', () => {
    const existing = [makeClimb('a'), makeClimb('b')];
    const allDuplicates = [makeClimb('a'), makeClimb('b')];

    const result = accumulateClimbs(existing, allDuplicates, 2);

    expect(result).toHaveLength(2);
    expect(result.map((climb) => climb.uuid)).toEqual(['a', 'b']);
  });

  it('page 1 with empty results returns empty array', () => {
    const existing = [makeClimb('a')];

    const result = accumulateClimbs(existing, [], 1);

    expect(result).toHaveLength(0);
  });

  it('works correctly for higher page numbers', () => {
    const existing = [makeClimb('a'), makeClimb('b'), makeClimb('c')];
    const page5 = [makeClimb('d'), makeClimb('e')];

    const result = accumulateClimbs(existing, page5, 5);

    expect(result).toHaveLength(5);
    expect(result.map((climb) => climb.uuid)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
});
