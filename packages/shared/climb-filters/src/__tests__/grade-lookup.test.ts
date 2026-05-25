import { describe, it, expect } from 'vitest';
import type { Grade } from '@boardsesh/shared-schema';
import { getGradeName } from '../grade-lookup';

const grades: Grade[] = [
  { difficultyId: 10, name: 'V0' },
  { difficultyId: 15, name: 'V2' },
  { difficultyId: 20, name: 'V4' },
];

describe('getGradeName', () => {
  it('returns grade name for a matching difficultyId', () => {
    expect(getGradeName(10, grades)).toBe('V0');
    expect(getGradeName(20, grades)).toBe('V4');
  });

  it('returns fallback string for unknown difficultyId', () => {
    expect(getGradeName(999, grades)).toBe('#999');
  });

  it('returns fallback for empty grades array', () => {
    expect(getGradeName(10, [])).toBe('#10');
  });
});
