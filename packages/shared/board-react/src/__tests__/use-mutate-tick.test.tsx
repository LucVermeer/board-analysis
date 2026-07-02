import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useUpdateTick, useDeleteTick } from '../use-mutate-tick';
import type { ExecuteHttp } from '../adapter';
import { createWrapper } from './test-helpers';

// Root keys that invalidateTickDependents refreshes on a successful edit/delete.
const TICK_DEPENDENT_KEYS = [
  'userTicks',
  'userProfileStats',
  'userClimbPercentile',
  'userAscentsFeed',
  'logbook',
  'climb',
  'searchClimbs',
  // The Sessions feed and session-detail cards aggregate from these caches and
  // must refresh when a tick they contain is edited or deleted.
  'sessionGroupedFeed',
  'sessionDetail',
];

const updateVars = {
  uuid: 'tick-1',
  input: { status: 'send' as const, difficulty: 16, quality: null, attemptCount: 2, comment: '' },
};

// First-element (root) of every queryKey passed to invalidateQueries.
function invalidatedRoots(calls: unknown[][]): unknown[] {
  return calls.map((call) => (call[0] as { queryKey?: unknown[] } | undefined)?.queryKey?.[0]);
}

describe('useUpdateTick (shared)', () => {
  it('rejects with "Not authenticated" and touches neither transport nor caches when signed out', async () => {
    const executeHttp = vi.fn();
    const { wrapper, queryClient } = createWrapper({
      isAuthenticated: false,
      executeHttp: executeHttp as unknown as ExecuteHttp,
    });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useUpdateTick(), { wrapper });

    await act(async () => {
      result.current.mutate(updateVars);
    });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error?.message).toBe('Not authenticated');
    expect(executeHttp).not.toHaveBeenCalled();
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('invalidates every tick-dependent cache on success', async () => {
    const executeHttp = vi.fn().mockResolvedValue({ updateTick: { uuid: 'tick-1' } });
    const { wrapper, queryClient } = createWrapper({ executeHttp: executeHttp as unknown as ExecuteHttp });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useUpdateTick(), { wrapper });

    await act(async () => {
      result.current.mutate(updateVars);
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const roots = invalidatedRoots(invalidateSpy.mock.calls);
    for (const key of TICK_DEPENDENT_KEYS) expect(roots).toContain(key);
  });

  it('does NOT invalidate caches when the mutation fails', async () => {
    const executeHttp = vi.fn().mockRejectedValue(new Error('Server exploded'));
    const { wrapper, queryClient } = createWrapper({ executeHttp: executeHttp as unknown as ExecuteHttp });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useUpdateTick(), { wrapper });

    await act(async () => {
      result.current.mutate(updateVars);
    });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});

describe('useDeleteTick (shared)', () => {
  it('rejects with "Not authenticated" and touches neither transport nor caches when signed out', async () => {
    const executeHttp = vi.fn();
    const { wrapper, queryClient } = createWrapper({
      isAuthenticated: false,
      executeHttp: executeHttp as unknown as ExecuteHttp,
    });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useDeleteTick(), { wrapper });

    await act(async () => {
      result.current.mutate('tick-1');
    });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error?.message).toBe('Not authenticated');
    expect(executeHttp).not.toHaveBeenCalled();
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('invalidates tick-dependent caches on success', async () => {
    const executeHttp = vi.fn().mockResolvedValue({ deleteTick: true });
    const { wrapper, queryClient } = createWrapper({ executeHttp: executeHttp as unknown as ExecuteHttp });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useDeleteTick(), { wrapper });

    await act(async () => {
      result.current.mutate('tick-1');
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const roots = invalidatedRoots(invalidateSpy.mock.calls);
    for (const key of TICK_DEPENDENT_KEYS) expect(roots).toContain(key);
  });

  it('does NOT invalidate caches when the delete fails', async () => {
    const executeHttp = vi.fn().mockRejectedValue(new Error('nope'));
    const { wrapper, queryClient } = createWrapper({ executeHttp: executeHttp as unknown as ExecuteHttp });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useDeleteTick(), { wrapper });

    await act(async () => {
      result.current.mutate('tick-1');
    });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('strips the deleted tick from every cached ascents-feed page before the refetch lands', async () => {
    const executeHttp = vi.fn().mockResolvedValue({ deleteTick: true });
    const { wrapper, queryClient } = createWrapper({ executeHttp: executeHttp as unknown as ExecuteHttp });
    // Two cached feed variants (different inputs) — the strip must hit both,
    // and only remove the deleted uuid. Invalidation's refetch never lands in
    // this harness (no network), so the post-mutate cache IS the strip result.
    const page = (uuids: string[]) => ({
      pages: [
        { userAscentsFeed: { items: uuids.map((uuid) => ({ uuid })), totalCount: uuids.length, hasMore: false } },
      ],
      pageParams: [0],
    });
    queryClient.setQueryData(['userAscentsFeed', 'user-1', { sortBy: 'recent' }], page(['tick-1', 'tick-2']));
    queryClient.setQueryData(['userAscentsFeed', 'user-1', { sortBy: 'hardest' }], page(['tick-1']));
    const { result } = renderHook(() => useDeleteTick(), { wrapper });

    await act(async () => {
      result.current.mutate('tick-1');
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    type CachedFeed = { pages: { userAscentsFeed: { items: { uuid: string }[]; totalCount: number } }[] };
    const recent = queryClient.getQueryData<CachedFeed>(['userAscentsFeed', 'user-1', { sortBy: 'recent' }]);
    const hardest = queryClient.getQueryData<CachedFeed>(['userAscentsFeed', 'user-1', { sortBy: 'hardest' }]);
    expect(recent?.pages[0].userAscentsFeed.items).toEqual([{ uuid: 'tick-2' }]);
    expect(hardest?.pages[0].userAscentsFeed.items).toEqual([]);
    // totalCount stays consistent with the strip — a stale-high count would
    // leak to any surface reading the total before the refetch reconciles.
    expect(recent?.pages[0].userAscentsFeed.totalCount).toBe(1);
    expect(hardest?.pages[0].userAscentsFeed.totalCount).toBe(0);
  });

  it('decrements totalCount by ONE even when offset overlap duplicated the row across pages', async () => {
    const executeHttp = vi.fn().mockResolvedValue({ deleteTick: true });
    const { wrapper, queryClient } = createWrapper({ executeHttp: executeHttp as unknown as ExecuteHttp });
    // Offset pagination can return the same tick on two adjacent pages; the
    // duplicates are cache artifacts — the true total drops by exactly one.
    queryClient.setQueryData(['userAscentsFeed', 'user-1', {}], {
      pages: [
        { userAscentsFeed: { items: [{ uuid: 'tick-1' }, { uuid: 'tick-2' }], totalCount: 3, hasMore: true } },
        { userAscentsFeed: { items: [{ uuid: 'tick-1' }, { uuid: 'tick-3' }], totalCount: 3, hasMore: false } },
      ],
      pageParams: [0, 2],
    });
    const { result } = renderHook(() => useDeleteTick(), { wrapper });

    await act(async () => {
      result.current.mutate('tick-1');
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    type CachedFeed = { pages: { userAscentsFeed: { items: { uuid: string }[]; totalCount: number } }[] };
    const cached = queryClient.getQueryData<CachedFeed>(['userAscentsFeed', 'user-1', {}]);
    expect(cached?.pages.map((page) => page.userAscentsFeed.items)).toEqual([
      [{ uuid: 'tick-2' }],
      [{ uuid: 'tick-3' }],
    ]);
    expect(cached?.pages.map((page) => page.userAscentsFeed.totalCount)).toEqual([2, 2]);
  });
});
