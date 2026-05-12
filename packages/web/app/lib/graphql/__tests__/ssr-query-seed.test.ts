// @vitest-environment node
import { describe, it, expect } from 'vite-plus/test';
import { ssrSeedMatchesQueryKey } from '../ssr-query-seed';

describe('ssrSeedMatchesQueryKey', () => {
  it('returns false when no SSR payload is present, even if keys match', () => {
    expect(
      ssrSeedMatchesQueryKey(false, { boardUuid: null, refreshKey: 0 }, { boardUuid: null, refreshKey: 0 }),
    ).toBe(false);
  });

  it('returns true when the live key tuple matches the snapshot exactly', () => {
    expect(
      ssrSeedMatchesQueryKey(true, { boardUuid: 'board-1', refreshKey: 0 }, { boardUuid: 'board-1', refreshKey: 0 }),
    ).toBe(true);
  });

  it('returns false when any single key component drifts (board switch)', () => {
    expect(
      ssrSeedMatchesQueryKey(true, { boardUuid: null, refreshKey: 0 }, { boardUuid: 'board-1', refreshKey: 0 }),
    ).toBe(false);
  });

  it('returns false when a refresh-key bump invalidates the snapshot', () => {
    expect(
      ssrSeedMatchesQueryKey(true, { boardUuid: 'board-1', refreshKey: 0 }, { boardUuid: 'board-1', refreshKey: 1 }),
    ).toBe(false);
  });

  it('treats null and undefined-coerced-to-null as the same "all boards" key', () => {
    expect(ssrSeedMatchesQueryKey(true, { boardUuid: null }, { boardUuid: null })).toBe(true);
  });

  it('compares every snapshot key, not just the first', () => {
    // boardUuid matches but refreshKey diverges — must still be rejected.
    expect(
      ssrSeedMatchesQueryKey(true, { boardUuid: 'b', refreshKey: 0 }, { boardUuid: 'b', refreshKey: 7 }),
    ).toBe(false);
  });
});
