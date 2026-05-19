import { describe, expect, it } from 'vite-plus/test';
import type { Climb } from '@/app/lib/types';
import { fetchPlaylistSuggestionClimbs, isAbortError } from '../playlist-suggestion-refresh';

function makeClimb(uuid: string): Climb {
  return {
    uuid,
    layoutId: 1,
    boardType: 'kilter',
    setter_username: 'setter',
    name: uuid,
    description: '',
    frames: 'p1r12',
    angle: 40,
    ascensionist_count: 0,
    difficulty: '5',
    quality_average: '3',
    stars: 3,
    difficulty_error: '',
    benchmark_difficulty: null,
  };
}

describe('playlist suggestion refresh', () => {
  it('loads pages until enough climbs after the activated climb are available', async () => {
    const calls: number[] = [];
    const pages = [
      { climbs: [makeClimb('before'), makeClimb('activated'), makeClimb('after-1')], hasMore: true },
      { climbs: [makeClimb('after-2'), makeClimb('after-3')], hasMore: true },
    ];

    const climbs = await fetchPlaylistSuggestionClimbs({
      activatedClimbUuid: 'activated',
      signal: new AbortController().signal,
      maxClimbsAfterActivated: 2,
      fetchPage: async ({ page }) => {
        calls.push(page);
        return pages[page] ?? { climbs: [], hasMore: false };
      },
    });

    expect(calls).toEqual([0, 1]);
    expect(climbs.map((climb) => climb.uuid)).toEqual(['before', 'activated', 'after-1', 'after-2', 'after-3']);
  });

  it('does not count the activated climb when it is at a page boundary', async () => {
    const calls: number[] = [];
    const pages = [
      { climbs: [makeClimb('activated')], hasMore: true },
      { climbs: [makeClimb('after-1')], hasMore: true },
      { climbs: [makeClimb('after-2')], hasMore: false },
    ];

    const climbs = await fetchPlaylistSuggestionClimbs({
      activatedClimbUuid: 'activated',
      signal: new AbortController().signal,
      maxClimbsAfterActivated: 1,
      fetchPage: async ({ page }) => {
        calls.push(page);
        return pages[page] ?? { climbs: [], hasMore: false };
      },
    });

    expect(calls).toEqual([0, 1]);
    expect(climbs.map((climb) => climb.uuid)).toEqual(['activated', 'after-1']);
  });

  it('does not fetch when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const calls: number[] = [];

    const climbs = await fetchPlaylistSuggestionClimbs({
      activatedClimbUuid: 'activated',
      signal: controller.signal,
      fetchPage: async ({ page }) => {
        calls.push(page);
        return { climbs: [makeClimb('activated')], hasMore: false };
      },
    });

    expect(calls).toEqual([]);
    expect(climbs).toEqual([]);
  });

  it('recognizes standard and legacy abort errors', () => {
    expect(isAbortError({ name: 'AbortError' })).toBe(true);
    expect(isAbortError({ code: 20 })).toBe(true);
    expect(isAbortError(new Error('network failed'))).toBe(false);
  });
});
