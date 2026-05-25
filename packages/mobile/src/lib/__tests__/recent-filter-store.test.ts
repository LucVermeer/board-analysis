import { describe, it, expect } from 'vitest';
import { getFilterKey } from '../filter-key';
import type { ClimbFilters } from '../climb-filter-types';

const defaultFilters: ClimbFilters = {
  sortBy: 'popular',
  sortOrder: 'desc',
};

describe('getFilterKey', () => {
  it('produces a stable key regardless of property insertion order', () => {
    const filtersA: ClimbFilters = { sortBy: 'popular', sortOrder: 'desc', minGrade: 10 };
    const filtersB: ClimbFilters = { minGrade: 10, sortOrder: 'desc', sortBy: 'popular' };
    expect(getFilterKey(filtersA, '')).toBe(getFilterKey(filtersB, ''));
  });

  it('includes search text in the key', () => {
    const keyWithText = getFilterKey(defaultFilters, 'hello');
    const keyWithoutText = getFilterKey(defaultFilters, '');
    expect(keyWithText).not.toBe(keyWithoutText);
  });

  it('differentiates filters with different values', () => {
    const filtersA: ClimbFilters = { ...defaultFilters, minGrade: 5 };
    const filtersB: ClimbFilters = { ...defaultFilters, minGrade: 10 };
    expect(getFilterKey(filtersA, '')).not.toBe(getFilterKey(filtersB, ''));
  });

  it('treats undefined optional fields as absent', () => {
    const filtersA: ClimbFilters = { sortBy: 'popular', sortOrder: 'desc' };
    const filtersB: ClimbFilters = { sortBy: 'popular', sortOrder: 'desc', minGrade: undefined };
    expect(getFilterKey(filtersA, '')).toBe(getFilterKey(filtersB, ''));
  });

  it('returns valid JSON', () => {
    const key = getFilterKey(defaultFilters, 'test');
    expect(() => JSON.parse(key)).not.toThrow();
  });
});
