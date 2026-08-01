import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClimbStatsEvent } from '@boardsesh/shared-schema';
import {
  acknowledgeOptimisticAscent,
  applyCanonicalClimbStats,
  beginOptimisticAscent,
  getClimbStatsRefCount,
  getClimbStatsSnapshot,
  markOptimisticAscentQueued,
  rejectOptimisticAscent,
  resetClimbStatsStoreForTests,
  setClimbStatsAuthEpoch,
  settleOfflineTickAscent,
  subscribeClimbStats,
  type ClimbStatsKey,
} from '../climb-stats-store';

const key: ClimbStatsKey = {
  boardType: 'kilter',
  layoutId: 1,
  climbUuid: 'climb-1',
  angle: 40,
};

function canonical(syncSeq: string, ascensionistCount: number, overrides?: Partial<ClimbStatsEvent>): ClimbStatsEvent {
  return {
    ...key,
    ascensionistCount,
    qualityAverage: 3.5,
    difficultyAverage: 19.2,
    displayDifficulty: 19,
    difficulty: '6c/V5',
    faUsername: 'setter',
    faAt: '2026-08-01T00:00:00.000Z',
    syncSeq,
    ...overrides,
  };
}

describe('climb stats external store', () => {
  beforeEach(() => resetClimbStatsStoreForTests());

  it('uses decimal BigInt revisions and drops stale, duplicate, and invalid events', () => {
    const unsubscribe = subscribeClimbStats(key, vi.fn());
    expect(applyCanonicalClimbStats(canonical('90071992547409930', 10))).toBe(true);
    expect(applyCanonicalClimbStats(canonical('90071992547409929', 9))).toBe(false);
    expect(applyCanonicalClimbStats(canonical('90071992547409930', 11))).toBe(false);
    expect(applyCanonicalClimbStats(canonical('1e20', 12))).toBe(false);
    expect(getClimbStatsSnapshot(key).canonical?.ascensionistCount).toBe(10);
    unsubscribe();
  });

  it('does not cache or notify an unrelated exact-key event', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeClimbStats(key, listener);
    const unrelated = canonical('1', 5, { climbUuid: 'climb-2' });
    expect(applyCanonicalClimbStats(unrelated)).toBe(false);
    expect(listener).not.toHaveBeenCalled();
    expect(getClimbStatsSnapshot(key).canonical).toBeNull();
    unsubscribe();
  });

  it('keeps concurrent first-send mutations at one floor and rolls back independently', () => {
    setClimbStatsAuthEpoch(7);
    const unsubscribe = subscribeClimbStats(key, vi.fn());
    beginOptimisticAscent(key, 'mutation-a', 7, 10);
    beginOptimisticAscent(key, 'mutation-b', 7, 10);
    expect(getClimbStatsSnapshot(key).optimisticFloor).toBe(11);

    rejectOptimisticAscent('mutation-a', 7);
    expect(getClimbStatsSnapshot(key).optimisticFloor).toBe(11);
    rejectOptimisticAscent('mutation-b', 7);
    expect(getClimbStatsSnapshot(key).optimisticFloor).toBeNull();
    unsubscribe();
  });

  it('floors from the immutable mutation base without incrementing a newer canonical snapshot', () => {
    setClimbStatsAuthEpoch(7);
    const unsubscribe = subscribeClimbStats(key, vi.fn());
    applyCanonicalClimbStats(canonical('1', 12));

    beginOptimisticAscent(key, 'mutation-a', 7, 10);
    beginOptimisticAscent(key, 'mutation-b', 7, 10);

    // max(canonical 12, immutable base 10 + 1), never canonical + 1 or +2.
    expect(getClimbStatsSnapshot(key).optimisticFloor).toBe(12);
    unsubscribe();
  });

  it('retires an acknowledged floor only after canonical catches it, including event-before-ack', () => {
    setClimbStatsAuthEpoch(4);
    const unsubscribe = subscribeClimbStats(key, vi.fn());
    beginOptimisticAscent(key, 'mutation-a', 4, 10);
    applyCanonicalClimbStats(canonical('2', 11));
    expect(getClimbStatsSnapshot(key).optimisticFloor).toBe(11);

    acknowledgeOptimisticAscent('mutation-a', 4);
    expect(getClimbStatsSnapshot(key)).toEqual({
      canonical: canonical('2', 11),
      optimisticFloor: null,
    });
    unsubscribe();
  });

  it('bridges queued tick acknowledgements and dead letters by tick UUID', () => {
    setClimbStatsAuthEpoch(2);
    const unsubscribe = subscribeClimbStats(key, vi.fn());
    beginOptimisticAscent(key, 'queued-a', 2, 20);
    markOptimisticAscentQueued('queued-a', 'tick-a', 2);
    expect(settleOfflineTickAscent('tick-a', 'acknowledged', 2)).toEqual(key);
    expect(getClimbStatsSnapshot(key).optimisticFloor).toBe(21);
    applyCanonicalClimbStats(canonical('5', 21));
    expect(getClimbStatsSnapshot(key).optimisticFloor).toBeNull();

    beginOptimisticAscent(key, 'queued-b', 2, 21);
    markOptimisticAscentQueued('queued-b', 'tick-b', 2);
    expect(settleOfflineTickAscent('tick-b', 'dead_letter', 2)).toEqual(key);
    expect(getClimbStatsSnapshot(key).optimisticFloor).toBeNull();
    unsubscribe();
  });

  it('closes the eager-drain race when acknowledgement arrives before UUID mapping', () => {
    setClimbStatsAuthEpoch(2);
    const unsubscribe = subscribeClimbStats(key, vi.fn());
    beginOptimisticAscent(key, 'queued-a', 2, 4);
    expect(settleOfflineTickAscent('tick-a', 'acknowledged', 2)).toBeNull();
    markOptimisticAscentQueued('queued-a', 'tick-a', 2);
    applyCanonicalClimbStats(canonical('2', 5));
    expect(getClimbStatsSnapshot(key).optimisticFloor).toBeNull();
    unsubscribe();
  });

  it('clears old-auth optimism and balances StrictMode-style subscribe cleanup', () => {
    setClimbStatsAuthEpoch(1);
    const cleanupFirst = subscribeClimbStats(key, vi.fn());
    const cleanupSecond = subscribeClimbStats(key, vi.fn());
    expect(getClimbStatsRefCount(key)).toBe(2);
    beginOptimisticAscent(key, 'mutation-a', 1, 3);
    setClimbStatsAuthEpoch(2);
    expect(getClimbStatsSnapshot(key).optimisticFloor).toBeNull();
    beginOptimisticAscent(key, 'stale-mutation', 1, 3);
    expect(getClimbStatsSnapshot(key).optimisticFloor).toBeNull();

    cleanupFirst();
    expect(getClimbStatsRefCount(key)).toBe(1);
    cleanupSecond();
    expect(getClimbStatsRefCount(key)).toBe(0);
  });
});
