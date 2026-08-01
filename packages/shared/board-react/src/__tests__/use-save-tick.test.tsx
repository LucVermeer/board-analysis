import { beforeEach, describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useSaveTick } from '../use-save-tick';
import type { ExecuteHttp } from '../adapter';
import { accumulatedLogbookQueryKey, fetchedLogbookClimbUuidsQueryKey } from '../logbook-keys';
import {
  getClimbStatsSnapshot,
  resetClimbStatsStoreForTests,
  subscribeClimbStats,
  type ClimbStatsKey,
} from '../climb-stats-store';
import type { LogbookEntry } from '../logbook-keys';
import type { SaveTickOptions } from '../tick-helpers';
import { createWrapper } from './test-helpers';

function tickOptions(overrides: Partial<SaveTickOptions> = {}): SaveTickOptions {
  return {
    climbUuid: 'climb-1',
    angle: 40,
    isMirror: false,
    status: 'send',
    attemptCount: 2,
    isBenchmark: false,
    comment: '',
    climbedAt: '2026-05-30T00:00:00.000Z',
    ...overrides,
  };
}

function savedTick(overrides: Record<string, unknown> = {}) {
  return {
    uuid: 'real-1',
    climbUuid: 'climb-1',
    angle: 40,
    isMirror: false,
    status: 'send',
    attemptCount: 2,
    quality: null,
    difficulty: null,
    comment: '',
    climbedAt: '2026-05-30T00:00:00.000Z',
    ...overrides,
  };
}

describe('useSaveTick (shared)', () => {
  beforeEach(() => resetClimbStatsStoreForTests());

  it('rejects with "Not authenticated" when the adapter reports unauthenticated', async () => {
    const { wrapper } = createWrapper({ isAuthenticated: false });
    const { result } = renderHook(() => useSaveTick('kilter'), { wrapper });

    await act(async () => {
      result.current.mutate(tickOptions());
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Not authenticated');
  });

  it('rejects with "No board selected" when boardName is null', async () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useSaveTick(null), { wrapper });

    await act(async () => {
      result.current.mutate(tickOptions());
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('No board selected');
  });

  it('inserts an optimistic entry on mutate, keyed by a generated temp uuid', async () => {
    let resolveExecute: (value: { saveTick: ReturnType<typeof savedTick> }) => void = () => {};
    const executeHttp = vi.fn().mockImplementation(
      () =>
        new Promise<{ saveTick: ReturnType<typeof savedTick> }>((resolve) => {
          resolveExecute = resolve;
        }),
    );

    const { wrapper, queryClient } = createWrapper({
      executeHttp: executeHttp as unknown as ExecuteHttp,
    });
    queryClient.setQueryData(accumulatedLogbookQueryKey('kilter'), []);

    const { result } = renderHook(() => useSaveTick('kilter'), { wrapper });

    act(() => {
      result.current.mutate(tickOptions({ status: 'flash' }));
    });

    await waitFor(() => {
      const cache = queryClient.getQueryData<LogbookEntry[]>(accumulatedLogbookQueryKey('kilter'));
      expect(cache?.length).toBe(1);
      expect(cache?.[0].uuid).toMatch(/^temp-/);
      expect(cache?.[0].climb_uuid).toBe('climb-1');
      expect(cache?.[0].is_ascent).toBe(true);
    });

    // Resolve the pending mutation so the test cleans up.
    await act(async () => {
      resolveExecute({ saveTick: savedTick({ uuid: 'real-1', status: 'flash' }) });
    });
  });

  it('replaces the temp entry with the saved entry on success', async () => {
    const executeHttp = vi.fn().mockResolvedValue({ saveTick: savedTick({ uuid: 'real-77' }) });
    const { wrapper, queryClient } = createWrapper({ executeHttp: executeHttp as unknown as ExecuteHttp });
    queryClient.setQueryData(accumulatedLogbookQueryKey('kilter'), []);

    const { result } = renderHook(() => useSaveTick('kilter'), { wrapper });

    await act(async () => {
      result.current.mutate(tickOptions());
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const cache = queryClient.getQueryData<LogbookEntry[]>(accumulatedLogbookQueryKey('kilter'));
    expect(cache?.length).toBe(1);
    expect(cache?.[0].uuid).toBe('real-77');
  });

  it('uses the adapter offline save path before falling back to HTTP', async () => {
    const executeHttp = vi.fn();
    const saveTickOffline = vi.fn().mockResolvedValue(savedTick({ uuid: 'local-1' }));
    const { wrapper, queryClient } = createWrapper({
      executeHttp: executeHttp as unknown as ExecuteHttp,
      saveTickOffline,
    });
    queryClient.setQueryData(accumulatedLogbookQueryKey('kilter'), []);

    const { result } = renderHook(() => useSaveTick('kilter'), { wrapper });

    await act(async () => {
      result.current.mutate(tickOptions({ climbUuid: 'climb-local' }));
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(saveTickOffline).toHaveBeenCalledWith(
      {
        input: expect.objectContaining({
          boardType: 'kilter',
          climbUuid: 'climb-local',
          angle: 40,
          climbedAt: '2026-05-30T00:00:00.000Z',
        }),
      },
      { queryClient, executeHttp },
    );
    expect(executeHttp).not.toHaveBeenCalled();

    const cache = queryClient.getQueryData<LogbookEntry[]>(accumulatedLogbookQueryKey('kilter'));
    expect(cache?.[0].uuid).toBe('local-1');
  });

  it('raises a first-send floor only after authoritative logbook coverage is known', async () => {
    let resolveExecute: (value: { saveTick: ReturnType<typeof savedTick> }) => void = () => {};
    const executeHttp = vi.fn().mockImplementation(
      () =>
        new Promise<{ saveTick: ReturnType<typeof savedTick> }>((resolve) => {
          resolveExecute = resolve;
        }),
    );
    const { wrapper, queryClient } = createWrapper({
      executeHttp: executeHttp as unknown as ExecuteHttp,
      supportsClimbStatsOptimism: true,
    });
    queryClient.setQueryData(accumulatedLogbookQueryKey('kilter'), []);
    queryClient.setQueryData(fetchedLogbookClimbUuidsQueryKey('kilter'), new Set(['climb-1']));
    const statsKey: ClimbStatsKey = {
      boardType: 'kilter',
      layoutId: 1,
      climbUuid: 'climb-1',
      angle: 40,
    };
    const unsubscribe = subscribeClimbStats(statsKey, vi.fn());
    const { result } = renderHook(() => useSaveTick('kilter'), { wrapper });

    act(() => result.current.mutate(tickOptions({ layoutId: 1, baseAscensionistCount: 37 })));
    await waitFor(() => expect(getClimbStatsSnapshot(statsKey).optimisticFloor).toBe(38));

    await act(async () => resolveExecute({ saveTick: savedTick() }));
    unsubscribe();
  });

  it('keeps an independent first-send floor when a concurrent optimistic send fails', async () => {
    const pendingMutations: Array<{
      resolve: (value: { saveTick: ReturnType<typeof savedTick> }) => void;
      reject: (reason: Error) => void;
    }> = [];
    const executeHttp = vi.fn().mockImplementation(
      () =>
        new Promise<{ saveTick: ReturnType<typeof savedTick> }>((resolve, reject) => {
          pendingMutations.push({ resolve, reject });
        }),
    );
    const scheduledTasks: Array<() => void> = [];
    const fetchClimbStats = vi.fn().mockResolvedValue([
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
    const { wrapper, queryClient } = createWrapper({
      executeHttp: executeHttp as unknown as ExecuteHttp,
      fetchClimbStats,
      supportsClimbStatsOptimism: true,
      scheduleTask: (callback) => {
        scheduledTasks.push(callback);
        return vi.fn();
      },
    });
    queryClient.setQueryData(accumulatedLogbookQueryKey('kilter'), []);
    queryClient.setQueryData(fetchedLogbookClimbUuidsQueryKey('kilter'), new Set(['climb-1']));
    const statsKey: ClimbStatsKey = {
      boardType: 'kilter',
      layoutId: 1,
      climbUuid: 'climb-1',
      angle: 40,
    };
    const unsubscribe = subscribeClimbStats(statsKey, vi.fn());
    const { result } = renderHook(() => useSaveTick('kilter'), { wrapper });

    act(() => {
      result.current.mutate(tickOptions({ layoutId: 1, baseAscensionistCount: 10 }));
      result.current.mutate(tickOptions({ layoutId: 1, baseAscensionistCount: 10 }));
    });
    await waitFor(() => expect(pendingMutations).toHaveLength(2));
    expect(getClimbStatsSnapshot(statsKey).optimisticFloor).toBe(11);

    await act(async () => {
      pendingMutations[0]?.reject(new Error('first save failed'));
    });
    await waitFor(() => {
      const logbook = queryClient.getQueryData<LogbookEntry[]>(accumulatedLogbookQueryKey('kilter'));
      expect(logbook).toHaveLength(1);
    });
    expect(getClimbStatsSnapshot(statsKey).optimisticFloor).toBe(11);

    await act(async () => {
      pendingMutations[1]?.resolve({ saveTick: savedTick({ uuid: 'real-2' }) });
    });
    await waitFor(() => expect(scheduledTasks).toHaveLength(1));
    expect(getClimbStatsSnapshot(statsKey).optimisticFloor).toBe(11);

    act(() => scheduledTasks[0]?.());
    await waitFor(() => expect(fetchClimbStats).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(getClimbStatsSnapshot(statsKey).optimisticFloor).toBeNull());
    expect(getClimbStatsSnapshot(statsKey).canonical?.ascensionistCount).toBe(11);
    unsubscribe();
  });

  it('does not create a climb-stats token when the adapter lacks the explicit mobile capability', async () => {
    let resolveExecute: (value: { saveTick: ReturnType<typeof savedTick> }) => void = () => {};
    const executeHttp = vi.fn().mockImplementation(
      () =>
        new Promise<{ saveTick: ReturnType<typeof savedTick> }>((resolve) => {
          resolveExecute = resolve;
        }),
    );
    const { wrapper, queryClient } = createWrapper({ executeHttp: executeHttp as unknown as ExecuteHttp });
    queryClient.setQueryData(accumulatedLogbookQueryKey('kilter'), []);
    queryClient.setQueryData(fetchedLogbookClimbUuidsQueryKey('kilter'), new Set(['climb-1']));
    const statsKey: ClimbStatsKey = {
      boardType: 'kilter',
      layoutId: 1,
      climbUuid: 'climb-1',
      angle: 40,
    };
    const unsubscribe = subscribeClimbStats(statsKey, vi.fn());
    const { result } = renderHook(() => useSaveTick('kilter'), { wrapper });

    act(() => result.current.mutate(tickOptions({ layoutId: 1, baseAscensionistCount: 37 })));
    await waitFor(() => expect(executeHttp).toHaveBeenCalledTimes(1));
    expect(getClimbStatsSnapshot(statsKey).optimisticFloor).toBeNull();

    await act(async () => resolveExecute({ saveTick: savedTick() }));
    unsubscribe();
  });

  it('does not speculate on the send count before the climb logbook has fetched', async () => {
    let resolveExecute: (value: { saveTick: ReturnType<typeof savedTick> }) => void = () => {};
    const executeHttp = vi.fn().mockImplementation(
      () =>
        new Promise<{ saveTick: ReturnType<typeof savedTick> }>((resolve) => {
          resolveExecute = resolve;
        }),
    );
    const { wrapper, queryClient } = createWrapper({ executeHttp: executeHttp as unknown as ExecuteHttp });
    queryClient.setQueryData(accumulatedLogbookQueryKey('kilter'), []);
    const statsKey: ClimbStatsKey = {
      boardType: 'kilter',
      layoutId: 1,
      climbUuid: 'climb-1',
      angle: 40,
    };
    const unsubscribe = subscribeClimbStats(statsKey, vi.fn());
    const { result } = renderHook(() => useSaveTick('kilter'), { wrapper });

    act(() => result.current.mutate(tickOptions({ layoutId: 1 })));
    await waitFor(() => expect(executeHttp).toHaveBeenCalledTimes(1));
    expect(getClimbStatsSnapshot(statsKey).optimisticFloor).toBeNull();

    await act(async () => resolveExecute({ saveTick: savedTick() }));
    unsubscribe();
  });

  it('invalidates the You-page feeds on success so a new tick appears in Logbook and Sessions', async () => {
    const executeHttp = vi.fn().mockResolvedValue({ saveTick: savedTick({ uuid: 'real-feed' }) });
    const { wrapper, queryClient } = createWrapper({ executeHttp: executeHttp as unknown as ExecuteHttp });
    queryClient.setQueryData(accumulatedLogbookQueryKey('kilter'), []);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useSaveTick('kilter'), { wrapper });

    await act(async () => {
      result.current.mutate(tickOptions());
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const roots = invalidateSpy.mock.calls.map(
      (call) => (call[0] as { queryKey?: unknown[] } | undefined)?.queryKey?.[0],
    );
    // Matches the edit/delete path: a freshly logged tick must refresh the
    // Logbook tab feed and the Sessions feed/detail, not just the stats charts.
    expect(roots).toContain('userAscentsFeed');
    expect(roots).toContain('sessionGroupedFeed');
    expect(roots).toContain('sessionDetail');
  });

  it('forwards a resolved presence boardId when provided', async () => {
    const executeHttp = vi.fn().mockResolvedValue({ saveTick: savedTick({ uuid: 'real-42' }) });
    const { wrapper } = createWrapper({ executeHttp: executeHttp as unknown as ExecuteHttp });
    const { result } = renderHook(() => useSaveTick('kilter'), { wrapper });

    await act(async () => {
      result.current.mutate(tickOptions({ boardId: 4242 }));
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(executeHttp.mock.calls[0][1].input.boardId).toBe(4242);
  });

  it('rolls back the optimistic entry on error', async () => {
    const executeHttp = vi.fn().mockRejectedValue(new Error('Server exploded'));
    const { wrapper, queryClient } = createWrapper({ executeHttp: executeHttp as unknown as ExecuteHttp });
    queryClient.setQueryData(accumulatedLogbookQueryKey('kilter'), []);

    const { result } = renderHook(() => useSaveTick('kilter'), { wrapper });

    await act(async () => {
      result.current.mutate(tickOptions());
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    const cache = queryClient.getQueryData<LogbookEntry[]>(accumulatedLogbookQueryKey('kilter'));
    expect(cache).toEqual([]);
  });

  it('does NOT recreate a logbook cache entry that was removed mid-flight', async () => {
    let resolveExecute: (value: { saveTick: ReturnType<typeof savedTick> }) => void = () => {};
    const executeHttp = vi.fn().mockImplementation(
      () =>
        new Promise<{ saveTick: ReturnType<typeof savedTick> }>((resolve) => {
          resolveExecute = resolve;
        }),
    );

    const { wrapper, queryClient } = createWrapper({ executeHttp: executeHttp as unknown as ExecuteHttp });
    queryClient.setQueryData(accumulatedLogbookQueryKey('kilter'), []);

    const { result } = renderHook(() => useSaveTick('kilter'), { wrapper });

    act(() => {
      result.current.mutate(tickOptions());
    });

    // Cache has an optimistic entry now.
    await waitFor(() => {
      const cache = queryClient.getQueryData<LogbookEntry[]>(accumulatedLogbookQueryKey('kilter'));
      expect(cache?.length).toBe(1);
    });

    // Simulate an explicit invalidation while the mutation is still in flight.
    act(() => {
      queryClient.removeQueries({ queryKey: ['logbook', 'kilter'] });
    });
    expect(queryClient.getQueryData(accumulatedLogbookQueryKey('kilter'))).toBeUndefined();

    // Resolve. onSuccess must NOT recreate the entry — `setQueriesData` only
    // touches existing queries.
    await act(async () => {
      resolveExecute({ saveTick: savedTick({ uuid: 'real-1' }) });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData(accumulatedLogbookQueryKey('kilter'))).toBeUndefined();
  });
});
