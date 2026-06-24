import { describe, it, expect } from 'vitest';
import { DEFAULT_WALL_FINDER_FILTER, hasActiveWallFinderFilter } from '../wall-finder-filter';

describe('hasActiveWallFinderFilter', () => {
  it('is inactive by default and for a bare place relocation', () => {
    expect(hasActiveWallFinderFilter(DEFAULT_WALL_FINDER_FILTER)).toBe(false);
    // A place is a relocate action, not a filter term.
    expect(hasActiveWallFinderFilter({ place: 'Tokyo' })).toBe(false);
  });

  it('is active with a name filter or one or more board types', () => {
    expect(hasActiveWallFinderFilter({ name: 'movement' })).toBe(true);
    expect(hasActiveWallFinderFilter({ boardTypes: ['kilter'] })).toBe(true);
    // An empty name / empty board-type array is not "active".
    expect(hasActiveWallFinderFilter({ name: '' })).toBe(false);
    expect(hasActiveWallFinderFilter({ boardTypes: [] })).toBe(false);
  });
});
