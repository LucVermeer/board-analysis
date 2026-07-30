import { describe, it, expect } from 'vitest';
import type { UserBoard } from '@boardsesh/shared-schema';
import { offlineBoardRows } from '../offline-board-items';

// Scope keys on the expectation side are hardcoded literals, NOT re-derived with
// offlineBoardKeyForBoard: a test that rebuilds the production expression can only
// ever agree with itself (see the SQL-stub-tests lesson in this repo).
const board = (overrides: Partial<UserBoard> & { uuid: string; name: string }): UserBoard =>
  ({
    boardType: 'kilter',
    layoutId: 8,
    sizeId: 17,
    setIds: '20,21',
    angle: 40,
    ...overrides,
  }) as unknown as UserBoard;

const kilterOriginal = 'kilter:8:17';

describe('offlineBoardRows', () => {
  it('offers BOTH boards that share one downloaded scope', () => {
    // The regression the whole design turns on: one download serves every board on
    // the same layout+size (storage-board-label.ts), so a scope-keyed map would drop
    // one of these two silently.
    const rows = offlineBoardRows({
      cards: [board({ uuid: 'garage', name: "Marco's garage" }), board({ uuid: 'gym-wall', name: 'Gym wall' })],
      cachedMyBoards: [],
      activeBoard: null,
      downloadedScopeKeys: [kilterOriginal],
    });

    // Both rows, each under its own name (name order: "Gym wall" then "Marco's garage").
    expect(rows.map((row) => [row.uuid, row.name])).toEqual([
      ['gym-wall', 'Gym wall'],
      ['garage', "Marco's garage"],
    ]);
  });

  it('excludes a card whose scope has no download', () => {
    const rows = offlineBoardRows({
      cards: [
        board({ uuid: 'downloaded', name: 'Downloaded' }),
        board({ uuid: 'not-downloaded', name: 'Not downloaded', layoutId: 1, sizeId: 5 }),
      ],
      cachedMyBoards: [],
      activeBoard: null,
      downloadedScopeKeys: [kilterOriginal],
    });

    expect(rows.map((row) => row.uuid)).toEqual(['downloaded']);
  });

  it('always offers the active board, downloaded or not, and sorts it first', () => {
    const rows = offlineBoardRows({
      cards: [board({ uuid: 'aaa-downloaded', name: 'Aaa downloaded' })],
      cachedMyBoards: [],
      activeBoard: board({ uuid: 'active', name: 'Zzz active', boardType: 'tension', layoutId: 12, sizeId: 3 }),
      downloadedScopeKeys: [kilterOriginal],
    });

    expect(rows.map((row) => row.uuid)).toEqual(['active', 'aaa-downloaded']);
  });

  it('sorts the non-active rows by name', () => {
    const rows = offlineBoardRows({
      cards: [
        board({ uuid: 'z', name: 'Zebra wall' }),
        board({ uuid: 'a', name: 'Aardvark wall' }),
        board({ uuid: 'm', name: 'Moose wall' }),
      ],
      cachedMyBoards: [],
      activeBoard: null,
      downloadedScopeKeys: [kilterOriginal],
    });

    expect(rows.map((row) => row.name)).toEqual(['Aardvark wall', 'Moose wall', 'Zebra wall']);
  });

  it('prefers the fresher copy of a board: active board beats cached beats card', () => {
    const rows = offlineBoardRows({
      cards: [board({ uuid: 'same', name: 'Stale snapshot name' })],
      cachedMyBoards: [board({ uuid: 'same', name: 'Cached name' })],
      activeBoard: board({ uuid: 'same', name: 'Freshest name' }),
      downloadedScopeKeys: [kilterOriginal],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe('Freshest name');
  });

  it('prefers the cached copy over the snapshot when the board is not active', () => {
    const rows = offlineBoardRows({
      cards: [board({ uuid: 'renamed', name: 'Old name' })],
      cachedMyBoards: [board({ uuid: 'renamed', name: 'New name' })],
      activeBoard: null,
      downloadedScopeKeys: [kilterOriginal],
    });

    expect(rows.map((row) => row.name)).toEqual(['New name']);
  });

  it('drops a malformed legacy card instead of rendering or crashing on it', () => {
    const rows = offlineBoardRows({
      // A card written by an older build: no uuid, and a layoutId that no longer
      // parses. Reaching setActiveBoard/board-presence with either would be worse
      // than one missing row.
      cards: [
        {
          name: 'No uuid',
          boardType: 'kilter',
          layoutId: 8,
          sizeId: 17,
          setIds: '20',
          angle: 40,
        } as unknown as UserBoard,
        board({ uuid: 'nan-layout', name: 'NaN layout', layoutId: Number.NaN }),
        board({ uuid: 'good', name: 'Good' }),
      ],
      cachedMyBoards: [],
      activeBoard: null,
      downloadedScopeKeys: [kilterOriginal],
    });

    expect(rows.map((row) => row.uuid)).toEqual(['good']);
  });

  it('returns nothing when no scope is downloaded and there is no active board', () => {
    const rows = offlineBoardRows({
      cards: [board({ uuid: 'a', name: 'A' })],
      cachedMyBoards: [board({ uuid: 'b', name: 'B' })],
      activeBoard: null,
      downloadedScopeKeys: [],
    });

    expect(rows).toEqual([]);
  });
});
