import { describe, expect, it, vi } from 'vitest';
import type { Climb, UserBoard } from '@boardsesh/shared-schema';
import type { PlannedClimbSlot } from '@boardsesh/playlist-generator';

// Monotonic uuids so each generated queue item is distinct (the real
// climbToQueueItem uses expo-crypto's randomUUID for the queue-item uuid).
const cryptoMock = vi.hoisted(() => {
  let n = 0;
  return { randomUUID: () => `qi-${n++}` };
});
vi.mock('expo-crypto', () => ({ randomUUID: cryptoMock.randomUUID }));

import {
  buildPools,
  pickUnused,
  refreshSlotInState,
  selectItemsFromPools,
  type PreviewFetchContext,
  type WorkoutPreviewData,
} from '../workout-preview-pool';

function makeClimb(uuid: string): Climb {
  return {
    uuid,
    name: `Climb ${uuid}`,
    frames: 'p1145r15',
    setter_username: 'tester',
    angle: 40,
    ascensionist_count: 10,
    difficulty: '6a',
    quality_average: '3',
    stars: 3,
    difficulty_error: '0',
    benchmark_difficulty: null,
    is_no_match: false,
  } as Climb;
}

function slot(grade: number, index: number): PlannedClimbSlot {
  return { grade, section: 'main', index };
}

const ctx: PreviewFetchContext = {
  board: { boardType: 'kilter', layoutId: 1, sizeId: 10, setIds: '1,2', angle: 40 } as UserBoard,
  isAuthenticated: false,
};

function buildState(poolByGrade: Record<number, string[]>, slotSpecs: [number, number][]): WorkoutPreviewData {
  const pools = new Map<number, Climb[]>(
    Object.entries(poolByGrade).map(([grade, uuids]) => [Number(grade), uuids.map(makeClimb)]),
  );
  const slots = slotSpecs.map(([grade, index]) => slot(grade, index));
  const { items, usedUuids } = selectItemsFromPools(slots, pools);
  return { items, pools, usedUuids };
}

describe('pickUnused', () => {
  it('returns the first climb not in the used set', () => {
    const pool = [makeClimb('a'), makeClimb('b'), makeClimb('c')];
    expect(pickUnused(pool, new Set(['a']))?.uuid).toBe('b');
    expect(pickUnused(pool, new Set(['a', 'b', 'c']))).toBeNull();
  });
});

describe('selectItemsFromPools', () => {
  it('picks a distinct climb per slot when the pool is large enough', () => {
    const pools = new Map([[10, [makeClimb('a'), makeClimb('b'), makeClimb('c')]]]);
    const { items, usedUuids } = selectItemsFromPools([slot(10, 0), slot(10, 1), slot(10, 2)], pools);
    expect(items.map((preview) => preview.item.climb.uuid)).toEqual(['a', 'b', 'c']);
    expect(usedUuids).toEqual(new Set(['a', 'b', 'c']));
  });

  it('repeats pool[0] when the pool is shorter than the slot count', () => {
    const pools = new Map([[10, [makeClimb('a')]]]);
    const { items } = selectItemsFromPools([slot(10, 0), slot(10, 1)], pools);
    expect(items.map((preview) => preview.item.climb.uuid)).toEqual(['a', 'a']);
  });

  it('skips a slot whose grade pool is empty', () => {
    const pools = new Map([[10, []]]);
    const { items } = selectItemsFromPools([slot(10, 0), slot(10, 1)], pools);
    expect(items).toEqual([]);
  });
});

describe('buildPools', () => {
  it('fetches one shuffled pool per unique grade', async () => {
    const fetchPool = vi.fn(async (grade: number) => [makeClimb(`${grade}-x`), makeClimb(`${grade}-y`)]);
    const pools = await buildPools([slot(10, 0), slot(10, 1), slot(12, 2)], ctx, fetchPool);
    expect(fetchPool).toHaveBeenCalledTimes(2); // grades 10 and 12, deduped
    expect(pools.get(10)).toHaveLength(2);
    expect(pools.get(12)).toHaveLength(2);
  });
});

describe('refreshSlotInState', () => {
  it('keeps the queue-item uuid and swaps to a different climb from the cache', async () => {
    const state = buildState({ 10: ['a', 'b'] }, [[10, 0]]); // one slot → climb 'a'
    const targetUuid = state.items[0].item.uuid;
    const fetchPool = vi.fn();

    const { state: next, changed } = await refreshSlotInState(state, targetUuid, ctx, fetchPool);

    expect(changed).toBe(true);
    expect(next.items[0].item.uuid).toBe(targetUuid); // queue-item identity preserved
    expect(next.items[0].item.climb.uuid).toBe('b'); // genuinely different climb
    expect(fetchPool).not.toHaveBeenCalled(); // cache had an unused climb
    expect(next.usedUuids).toEqual(new Set(['b']));
  });

  it('never re-picks a climb already shown in another row (cache miss → refetch)', async () => {
    // Two slots at grade 10, pool exactly [a, b] → rows show a and b (both used).
    const state = buildState({ 10: ['a', 'b'] }, [
      [10, 0],
      [10, 1],
    ]);
    const targetUuid = state.items[0].item.uuid; // currently 'a'
    // Refetch returns a fresh climb 'c' not shown anywhere.
    const fetchPool = vi.fn(async () => [makeClimb('a'), makeClimb('b'), makeClimb('c')]);

    const { state: next, changed } = await refreshSlotInState(state, targetUuid, ctx, fetchPool);

    expect(changed).toBe(true);
    expect(fetchPool).toHaveBeenCalledTimes(1);
    expect(next.items[0].item.climb.uuid).toBe('c'); // the only not-elsewhere-shown climb
    expect(next.items[1].item.climb.uuid).toBe('b'); // sibling untouched
  });

  it('allows a differing repeat when every climb at the grade is already shown', async () => {
    // Two slots, two-climb catalog → a and b both used; refetch yields nothing new.
    const state = buildState({ 10: ['a', 'b'] }, [
      [10, 0],
      [10, 1],
    ]);
    const targetUuid = state.items[0].item.uuid; // 'a'
    const fetchPool = vi.fn(async () => [makeClimb('a'), makeClimb('b')]);

    const { state: next, changed } = await refreshSlotInState(state, targetUuid, ctx, fetchPool);

    expect(changed).toBe(true);
    expect(next.items[0].item.climb.uuid).toBe('b'); // differs from the old 'a' (a duplicate of row 1)
  });

  it('no-ops when the grade has only the climb already shown', async () => {
    const state = buildState({ 10: ['a'] }, [[10, 0]]);
    const targetUuid = state.items[0].item.uuid;
    const fetchPool = vi.fn(async () => [makeClimb('a')]);

    const { changed } = await refreshSlotInState(state, targetUuid, ctx, fetchPool);

    expect(changed).toBe(false);
  });

  it('no-ops for a stale uuid that is no longer in the list', async () => {
    const state = buildState({ 10: ['a', 'b'] }, [[10, 0]]);
    const fetchPool = vi.fn();
    const { changed } = await refreshSlotInState(state, 'nonexistent', ctx, fetchPool);
    expect(changed).toBe(false);
    expect(fetchPool).not.toHaveBeenCalled();
  });
});
