import { act, render, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BoardAdapter } from '../adapter';
import {
  acknowledgeOptimisticAscent,
  applyCanonicalClimbStats,
  beginOptimisticAscent,
  getClimbStatsSnapshot,
  markOptimisticAscentQueued,
  resetClimbStatsStoreForTests,
  subscribeClimbStats,
  type ClimbStatsKey,
} from '../climb-stats-store';
import {
  createAcknowledgedClimbStatsReadOwner,
  getClimbStatsReadCoordinatorStateForTests,
  MAX_LAST_READ_ENTRIES,
  recordClimbStatsReadForTests,
  resetClimbStatsReadCoordinatorForTests,
  scheduleAcknowledgedClimbStatsRead,
  useClimbStatsLayoutSync,
  useEffectiveClimbStats,
} from '../use-effective-climb-stats';
import { createWrapper } from './test-helpers';

describe('useEffectiveClimbStats', () => {
  beforeEach(() => {
    resetClimbStatsStoreForTests();
    resetClimbStatsReadCoordinatorForTests();
  });

  it('re-renders only the exact-key selector child when canonical stats arrive', () => {
    const selectorRender = vi.fn();
    const stableSiblingRender = vi.fn();
    const { wrapper: Wrapper } = createWrapper();

    function StatsSelector() {
      selectorRender();
      const stats = useEffectiveClimbStats('kilter', 1, 'climb-1', 40, {
        ascensionistCount: 4,
        qualityAverage: '2.5',
        difficulty: '6a/V3',
      });
      return <span>{stats.ascensionistCount}</span>;
    }

    function StableSibling() {
      stableSiblingRender();
      return <span>thumbnail</span>;
    }

    render(
      <Wrapper>
        <StableSibling />
        <StatsSelector />
      </Wrapper>,
    );
    expect(selectorRender).toHaveBeenCalledTimes(1);
    expect(stableSiblingRender).toHaveBeenCalledTimes(1);

    act(() => {
      applyCanonicalClimbStats({
        boardType: 'kilter',
        layoutId: 1,
        climbUuid: 'climb-1',
        angle: 40,
        ascensionistCount: 5,
        qualityAverage: 3,
        difficultyAverage: 18,
        displayDifficulty: 18,
        difficulty: '6b/V4',
        faUsername: null,
        faAt: null,
        syncSeq: '10',
      });
    });

    expect(selectorRender).toHaveBeenCalledTimes(2);
    expect(stableSiblingRender).toHaveBeenCalledTimes(1);
  });

  it('treats null fields on a canonical snapshot as authoritative clears', () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(
      () =>
        useEffectiveClimbStats('kilter', 1, 'climb-1', 40, {
          ascensionistCount: 4,
          qualityAverage: '4.5',
          difficulty: '6b/V4',
        }),
      { wrapper },
    );

    act(() => {
      applyCanonicalClimbStats({
        boardType: 'kilter',
        layoutId: 1,
        climbUuid: 'climb-1',
        angle: 40,
        ascensionistCount: 5,
        qualityAverage: null,
        difficultyAverage: null,
        displayDifficulty: null,
        difficulty: null,
        faUsername: null,
        faAt: null,
        syncSeq: '10',
      });
    });

    expect(result.current).toEqual({
      ascensionistCount: 5,
      qualityAverage: null,
      difficulty: null,
    });
  });

  it('limits mount reads to four and discards queued keys that unmount', async () => {
    const pendingReads = new Map<string, () => void>();
    const fetchClimbStats = vi.fn(
      (_boardType: string, climbUuid: string) =>
        new Promise<[]>((resolve) => {
          pendingReads.set(climbUuid, () => resolve([]));
        }),
    );
    const { wrapper: Wrapper } = createWrapper({ fetchClimbStats });
    const climbUuids = Array.from({ length: 6 }, (_, index) => `climb-${index + 1}`);

    function StatsRow({ climbUuid }: { climbUuid: string }) {
      useEffectiveClimbStats('kilter', 1, climbUuid, 40, { ascensionistCount: 0 });
      return null;
    }

    const view = render(
      <Wrapper>
        {climbUuids.map((climbUuid) => (
          <StatsRow key={climbUuid} climbUuid={climbUuid} />
        ))}
      </Wrapper>,
    );

    await waitFor(() => expect(fetchClimbStats).toHaveBeenCalledTimes(4));
    expect(getClimbStatsReadCoordinatorStateForTests()).toMatchObject({ active: 4, queued: 2 });

    view.rerender(
      <Wrapper>
        {climbUuids.slice(0, 4).map((climbUuid) => (
          <StatsRow key={climbUuid} climbUuid={climbUuid} />
        ))}
      </Wrapper>,
    );
    await waitFor(() => expect(getClimbStatsReadCoordinatorStateForTests().queued).toBe(0));

    await act(async () => {
      for (const resolveRead of pendingReads.values()) resolveRead();
    });
    await waitFor(() => expect(getClimbStatsReadCoordinatorStateForTests().active).toBe(0));
    expect(fetchClimbStats).toHaveBeenCalledTimes(4);
  });

  it('TTL-prunes and LRU-bounds read timestamps', () => {
    const startingTime = 1_000_000;
    for (let index = 0; index <= MAX_LAST_READ_ENTRIES; index += 1) {
      recordClimbStatsReadForTests(`climb-${index}`, startingTime + index);
    }
    expect(getClimbStatsReadCoordinatorStateForTests().timestamps).toBe(MAX_LAST_READ_ENTRIES);

    resetClimbStatsReadCoordinatorForTests();
    recordClimbStatsReadForTests('stale', startingTime);
    recordClimbStatsReadForTests('fresh', startingTime + 11 * 60_000);
    expect(getClimbStatsReadCoordinatorStateForTests().timestamps).toBe(1);
  });

  it('dedupes mount reads and performs bounded repair on reconnect and the missed-event timer', async () => {
    const fetchClimbStats = vi.fn().mockResolvedValue([
      {
        angle: 40,
        ascensionistCount: 5,
        qualityAverage: 3,
        difficultyAverage: 18,
        displayDifficulty: 18,
        difficulty: '6b/V4',
        faUsername: null,
        faAt: null,
        syncSeq: '10',
      },
    ]);
    let connected: (() => void) | undefined;
    const scheduledTasks: Array<{ callback: () => void; cancel: ReturnType<typeof vi.fn>; delayMs: number }> = [];
    const { wrapper } = createWrapper({
      fetchClimbStats,
      subscribeClimbStats: (_boardType, _layoutId, handlers) => {
        connected = handlers.connected;
        return vi.fn();
      },
      scheduleTask: (callback, delayMs) => {
        const cancel = vi.fn();
        scheduledTasks.push({ callback, cancel, delayMs });
        return cancel;
      },
    });

    const view = renderHook(
      () => {
        useClimbStatsLayoutSync('kilter', 1);
        return useEffectiveClimbStats('kilter', 1, 'climb-1', 40, { ascensionistCount: 4 });
      },
      { wrapper },
    );
    await waitFor(() => expect(fetchClimbStats).toHaveBeenCalledTimes(1));

    act(() => connected?.());
    await waitFor(() => expect(fetchClimbStats).toHaveBeenCalledTimes(2));

    const missedEventRepair = scheduledTasks[0]?.callback;
    expect(missedEventRepair).toBeTypeOf('function');
    expect(scheduledTasks[0]?.delayMs).toBe(120_000);
    act(() => missedEventRepair?.());
    await waitFor(() => expect(fetchClimbStats).toHaveBeenCalledTimes(3));
    expect(scheduledTasks).toHaveLength(2);

    view.unmount();
    expect(scheduledTasks[1]?.cancel).toHaveBeenCalledTimes(1);
  });

  it('cancels a pending post-ack read when the layout sync owner unmounts', () => {
    const fetchClimbStats = vi.fn().mockResolvedValue([]);
    let deliveryListener:
      | ((event: {
          tableName: string;
          operation: string;
          idempotencyKey: string;
          status: 'acknowledged' | 'dead_letter';
        }) => void)
      | undefined;
    const unsubscribeDelivery = vi.fn();
    const scheduledTasks: Array<{ callback: () => void; cancel: ReturnType<typeof vi.fn> }> = [];
    const { wrapper } = createWrapper({
      fetchClimbStats,
      subscribeOfflineMutationDelivery: (listener) => {
        deliveryListener = listener;
        return unsubscribeDelivery;
      },
      scheduleTask: (callback) => {
        const cancel = vi.fn();
        scheduledTasks.push({ callback, cancel });
        return cancel;
      },
    });
    const statsKey: ClimbStatsKey = {
      boardType: 'kilter',
      layoutId: 1,
      climbUuid: 'climb-1',
      angle: 40,
    };
    beginOptimisticAscent(statsKey, 'token-1', 0, 10);
    markOptimisticAscentQueued('token-1', 'tick-1', 0);

    const view = renderHook(() => useClimbStatsLayoutSync(null, undefined), { wrapper });
    act(() => {
      deliveryListener?.({
        tableName: 'boardsesh_ticks',
        operation: 'create',
        idempotencyKey: 'tick-1',
        status: 'acknowledged',
      });
    });
    expect(scheduledTasks).toHaveLength(1);

    view.unmount();
    expect(unsubscribeDelivery).toHaveBeenCalledTimes(1);
    expect(scheduledTasks[0]?.cancel).toHaveBeenCalledTimes(1);

    act(() => scheduledTasks[0]?.callback());
    expect(fetchClimbStats).not.toHaveBeenCalled();
  });

  it('cancels every pending post-ack read owned by one lifecycle', () => {
    const cancelTasks = [vi.fn(), vi.fn()];
    const adapter: BoardAdapter = {
      isAuthenticated: true,
      isAuthLoading: false,
      executeHttp: async () => {
        throw new Error('not used');
      },
      executeWs: async () => {
        throw new Error('not used');
      },
      resolveActiveSessionId: () => undefined,
      scheduleTask: vi.fn().mockReturnValueOnce(cancelTasks[0]).mockReturnValueOnce(cancelTasks[1]),
    };
    const owner = createAcknowledgedClimbStatsReadOwner();
    owner.schedule(adapter, { boardType: 'kilter', layoutId: 1, climbUuid: 'climb-1', angle: 40 });
    owner.schedule(adapter, { boardType: 'kilter', layoutId: 1, climbUuid: 'climb-2', angle: 40 });

    owner.cancelAll();

    expect(cancelTasks[0]).toHaveBeenCalledTimes(1);
    expect(cancelTasks[1]).toHaveBeenCalledTimes(1);
  });

  it('does not retain a cancellation handle when the scheduler runs synchronously', async () => {
    const statsKey: ClimbStatsKey = {
      boardType: 'kilter',
      layoutId: 1,
      climbUuid: 'climb-sync',
      angle: 40,
    };
    const unsubscribe = subscribeClimbStats(statsKey, vi.fn());
    const cancelTask = vi.fn();
    const fetchClimbStats = vi.fn().mockResolvedValue([]);
    const owner = createAcknowledgedClimbStatsReadOwner();
    owner.schedule(
      {
        isAuthenticated: true,
        isAuthLoading: false,
        executeHttp: async () => {
          throw new Error('not used');
        },
        executeWs: async () => {
          throw new Error('not used');
        },
        resolveActiveSessionId: () => undefined,
        fetchClimbStats,
        scheduleTask: (callback) => {
          callback();
          return cancelTask;
        },
      },
      statsKey,
    );

    await waitFor(() => expect(fetchClimbStats).toHaveBeenCalledTimes(1));
    owner.cancelAll();
    expect(cancelTask).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('starts one forced post-ack read after a stale in-flight read settles', async () => {
    const pendingReads: Array<
      (
        rows: Array<{
          angle: number;
          ascensionistCount: number;
          qualityAverage: number | null;
          difficultyAverage: number | null;
          displayDifficulty: number | null;
          difficulty: string | null;
          faUsername: string | null;
          faAt: string | null;
          syncSeq: string;
        }>,
      ) => void
    > = [];
    const fetchClimbStats = vi.fn(
      () =>
        new Promise<Parameters<(typeof pendingReads)[number]>[0]>((resolve) => {
          pendingReads.push(resolve);
        }),
    );
    const scheduledTasks: Array<() => void> = [];
    const adapterOverrides = {
      fetchClimbStats,
      scheduleTask: (callback: () => void) => {
        scheduledTasks.push(callback);
        return vi.fn();
      },
    };
    const { wrapper } = createWrapper(adapterOverrides);
    const statsKey: ClimbStatsKey = {
      boardType: 'kilter',
      layoutId: 1,
      climbUuid: 'climb-1',
      angle: 40,
    };
    const { result } = renderHook(() => useEffectiveClimbStats('kilter', 1, 'climb-1', 40, { ascensionistCount: 10 }), {
      wrapper,
    });
    await waitFor(() => expect(fetchClimbStats).toHaveBeenCalledTimes(1));

    act(() => {
      beginOptimisticAscent(statsKey, 'token-1', 0, 10);
      acknowledgeOptimisticAscent('token-1', 0);
      scheduleAcknowledgedClimbStatsRead(
        {
          isAuthenticated: true,
          isAuthLoading: false,
          executeHttp: async () => {
            throw new Error('not used');
          },
          executeWs: async () => {
            throw new Error('not used');
          },
          resolveActiveSessionId: () => undefined,
          ...adapterOverrides,
        },
        statsKey,
      );
      scheduledTasks[0]?.();
      scheduledTasks[0]?.();
    });

    expect(fetchClimbStats).toHaveBeenCalledTimes(1);
    expect(getClimbStatsReadCoordinatorStateForTests()).toMatchObject({ active: 1, queued: 1 });
    expect(result.current.ascensionistCount).toBe(11);

    await act(async () => {
      pendingReads[0]?.([
        {
          angle: 40,
          ascensionistCount: 10,
          qualityAverage: null,
          difficultyAverage: null,
          displayDifficulty: null,
          difficulty: null,
          faUsername: null,
          faAt: null,
          syncSeq: '10',
        },
      ]);
    });
    await waitFor(() => expect(fetchClimbStats).toHaveBeenCalledTimes(2));
    expect(result.current.ascensionistCount).toBe(11);
    expect(getClimbStatsSnapshot(statsKey).optimisticFloor).toBe(11);

    await act(async () => {
      pendingReads[1]?.([
        {
          angle: 40,
          ascensionistCount: 11,
          qualityAverage: null,
          difficultyAverage: null,
          displayDifficulty: null,
          difficulty: null,
          faUsername: null,
          faAt: null,
          syncSeq: '11',
        },
      ]);
    });
    await waitFor(() => expect(getClimbStatsSnapshot(statsKey).optimisticFloor).toBeNull());
    expect(fetchClimbStats).toHaveBeenCalledTimes(2);
    expect(result.current.ascensionistCount).toBe(11);
  });
});
