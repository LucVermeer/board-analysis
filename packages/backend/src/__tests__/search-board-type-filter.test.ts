import { describe, it, expect } from 'vite-plus/test';
import { SearchGymsInputSchema } from '../validation/schemas/gyms';
import { SearchBoardsInputSchema } from '../validation/schemas/boards';

// The board-type filter (gym + board search) is enforced in SQL — a gym→board
// EXISTS join for gyms, an inArray for boards. These tests cover the input
// contract those queries depend on: the `boardTypes` array must accept valid
// board names, reject junk, and stay optional so unfiltered search is unchanged.

describe('SearchGymsInput board-type filter', () => {
  it('accepts a multi-select array of valid board types', () => {
    const parsed = SearchGymsInputSchema.parse({ boardTypes: ['kilter', 'tension'] });
    expect(parsed.boardTypes).toEqual(['kilter', 'tension']);
  });

  it('stays optional — an unfiltered search leaves boardTypes undefined', () => {
    expect(SearchGymsInputSchema.parse({}).boardTypes).toBeUndefined();
  });

  it('rejects an unknown board type', () => {
    expect(SearchGymsInputSchema.safeParse({ boardTypes: ['not-a-board'] }).success).toBe(false);
  });
});

describe('SearchBoardsInput board-type filter', () => {
  it('accepts a multi-select array of valid board types', () => {
    const parsed = SearchBoardsInputSchema.parse({ boardTypes: ['kilter'] });
    expect(parsed.boardTypes).toEqual(['kilter']);
  });

  it('still accepts the legacy singular boardType alongside the array', () => {
    const parsed = SearchBoardsInputSchema.parse({ boardType: 'tension', boardTypes: ['kilter'] });
    expect(parsed.boardType).toBe('tension');
    expect(parsed.boardTypes).toEqual(['kilter']);
  });

  it('rejects an unknown board type', () => {
    expect(SearchBoardsInputSchema.safeParse({ boardTypes: ['nope'] }).success).toBe(false);
  });
});
