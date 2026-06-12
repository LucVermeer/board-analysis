import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, renderHook, waitFor } from '@testing-library/react';
import type { BoardPresenceClimb, BoardPresenceEvent, BoardPresenceStats } from '@boardsesh/shared-schema';
import { useBoardPresence } from '../use-board-presence';
import {
  BoardPresenceProvider,
  useBoardPresenceActions,
  useBoardPresenceCurrent,
  useBoardPresenceFeed,
} from '../board-presence-provider';
import type { BoardPresenceClient } from '../types';

// Build a BoardPresenceClimb with only the fields the reducer/hook care about.
const climb = (climbUuid: string, seq: number, overrides: Partial<BoardPresenceClimb> = {}): BoardPresenceClimb => ({
  climbUuid,
  seq,
  sentAt: new Date(seq * 1000).toISOString(),
  name: `Climb ${climbUuid}`,
  angle: 40,
  ...overrides,
});

const setEvent = (presenceClimb: BoardPresenceClimb): BoardPresenceEvent => ({
  __typename: 'BoardClimbSet',
  climb: presenceClimb,
});

const clearEvent = (seq: number): BoardPresenceEvent => ({
  __typename: 'BoardClimbCleared',
  clearedAt: new Date(seq * 1000).toISOString(),
  seq,
});

const emptyStats: BoardPresenceStats = {
  climbsSentCount: 0,
  distinctClimbersCount: 0,
  hardestGrade: null,
  topGrade: null,
  lastSentAt: null,
};

const statsEvent = (seq: number, stats: Partial<BoardPresenceStats>): BoardPresenceEvent => ({
  __typename: 'BoardStatsUpdated',
  stats: { ...emptyStats, ...stats },
  seq,
});

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void };
function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

// A controllable fake client. `emit` pushes a live event to the current
// subscriber; the recent-climbs / stats fetches return a per-board deferred so a
// test can interleave a live event before the backfill lands AND resolve a
// superseded board's fetch independently (exercising the stale-board guard).
function makeClient() {
  let onEvent: ((event: BoardPresenceEvent) => void) | null = null;
  let onError: ((err: unknown) => void) | null = null;
  let onComplete: (() => void) | null = null;
  const unsubscribe = vi.fn();
  let subscribedBoardId: number | null = null;

  const recentByBoard = new Map<number, Deferred<BoardPresenceClimb[]>>();
  const statsByBoard = new Map<number, Deferred<BoardPresenceStats>>();
  const recentFor = (boardId: number) => {
    const existing = recentByBoard.get(boardId);
    if (existing) {
      return existing;
    }
    const next = deferred<BoardPresenceClimb[]>();
    recentByBoard.set(boardId, next);
    return next;
  };
  const statsFor = (boardId: number) => {
    const existing = statsByBoard.get(boardId);
    if (existing) {
      return existing;
    }
    const next = deferred<BoardPresenceStats>();
    statsByBoard.set(boardId, next);
    return next;
  };

  const reportClimb = vi.fn(async () => true);
  // Captured separately so assertions reference the bound mock directly
  // (referencing `client.fetchX` trips the unbound-method lint).
  const fetchRecentClimbs = vi.fn((boardId: number) => recentFor(boardId).promise);
  const fetchStats = vi.fn((boardId: number) => statsFor(boardId).promise);
  const subscribeNowPlaying = vi.fn(
    (
      boardId: number,
      handler: (event: BoardPresenceEvent) => void,
      errorHandler?: (err: unknown) => void,
      completeHandler?: () => void,
    ): (() => void) => {
      subscribedBoardId = boardId;
      onEvent = handler;
      onError = errorHandler ?? null;
      onComplete = completeHandler ?? null;
      return unsubscribe;
    },
  );

  const client: BoardPresenceClient = {
    subscribeNowPlaying,
    fetchRecentClimbs,
    fetchStats,
    reportClimb,
    resolveBoardForSerial: vi.fn(),
  };

  return {
    client,
    unsubscribe,
    reportClimb,
    fetchRecentClimbs,
    fetchStats,
    subscribeNowPlaying,
    emit: (event: BoardPresenceEvent) => onEvent?.(event),
    emitError: (err: unknown) => onError?.(err),
    emitComplete: () => onComplete?.(),
    getSubscribedBoardId: () => subscribedBoardId,
    resolveRecent: (boardId: number, climbs: BoardPresenceClimb[]) => {
      const target = recentFor(boardId);
      target.resolve(climbs);
      return target.promise;
    },
    resolveStats: (boardId: number, stats: BoardPresenceStats) => {
      const target = statsFor(boardId);
      target.resolve(stats);
      return target.promise;
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useBoardPresence — null inputs', () => {
  it('stays inert with a null boardId', () => {
    const harness = makeClient();
    const { result } = renderHook(() => useBoardPresence(null, harness.client));
    expect(result.current.currentClimb).toBeNull();
    expect(result.current.history).toEqual([]);
    expect(result.current.isLive).toBe(false);
    // A null boardId must not open a subscription or fire the catch-up fetches.
    expect(harness.getSubscribedBoardId()).toBeNull();
    expect(harness.fetchRecentClimbs).not.toHaveBeenCalled();
  });

  it('stays inert with a null client', () => {
    const { result } = renderHook(() => useBoardPresence(7, null));
    expect(result.current.currentClimb).toBeNull();
    expect(result.current.isLive).toBe(false);
  });

  it('report no-ops (resolves false) when inert', async () => {
    const { result } = renderHook(() => useBoardPresence(null, null));
    await expect(result.current.reportClimb({ uuid: 'q', climb: { uuid: 'c' } } as never, 40)).resolves.toBe(false);
  });
});

describe('useBoardPresence — subscribe before backfill', () => {
  it('subscribes before fetching recent climbs', () => {
    const harness = makeClient();
    renderHook(() => useBoardPresence(1, harness.client));
    // Subscription is attached synchronously in the effect, before the fetches.
    expect(harness.getSubscribedBoardId()).toBe(1);
    expect(harness.fetchRecentClimbs).toHaveBeenCalledWith(1);
    expect(harness.fetchStats).toHaveBeenCalledWith(1);
    expect(harness.subscribeNowPlaying.mock.invocationCallOrder[0]).toBeLessThan(
      harness.fetchRecentClimbs.mock.invocationCallOrder[0],
    );
  });

  it('keeps a live event that lands before the backfill, and a stale backfill does not clobber it', async () => {
    const harness = makeClient();
    const { result } = renderHook(() => useBoardPresence(1, harness.client));

    // A newer live event (seq 5) arrives DURING catch-up, before the backfill.
    act(() => {
      harness.emit(setEvent(climb('live', 5)));
    });
    expect(result.current.currentClimb?.climbUuid).toBe('live');

    // The backfill resolves with OLDER history (seq 1-3). It must merge into
    // history without regressing the newer live current.
    await act(async () => {
      await harness.resolveRecent(1, [climb('old3', 3), climb('old2', 2), climb('old1', 1)]);
    });

    expect(result.current.currentClimb?.climbUuid).toBe('live');
    expect(result.current.currentClimb?.seq).toBe(5);
    // History contains both the live climb and the backfilled ones, newest-first.
    expect(result.current.history.map((entry) => entry.climbUuid)).toEqual(['live', 'old3', 'old2', 'old1']);
  });

  it('keeps a live clear that lands before backfill from being resurrected by older history', async () => {
    const harness = makeClient();
    const { result } = renderHook(() => useBoardPresence(1, harness.client));

    act(() => {
      harness.emit(clearEvent(10));
    });
    expect(result.current.currentClimb).toBeNull();

    await act(async () => {
      await harness.resolveRecent(1, [climb('cleared-before-backfill', 9)]);
    });

    expect(result.current.currentClimb).toBeNull();
    expect(result.current.history.map((entry) => entry.climbUuid)).toEqual(['cleared-before-backfill']);
  });

  it('adopts the newest backfilled climb as current when no live event has arrived', async () => {
    const harness = makeClient();
    const { result } = renderHook(() => useBoardPresence(1, harness.client));

    await act(async () => {
      await harness.resolveRecent(1, [climb('b', 4), climb('a', 2)]);
    });

    expect(result.current.currentClimb?.climbUuid).toBe('b');
    expect(result.current.history.map((entry) => entry.climbUuid)).toEqual(['b', 'a']);
  });

  it('stores stats once the fetch resolves and reports isLive', async () => {
    const harness = makeClient();
    const { result } = renderHook(() => useBoardPresence(1, harness.client));
    expect(result.current.isLive).toBe(true);

    await act(async () => {
      await harness.resolveStats(1, { ...emptyStats, climbsSentCount: 12, hardestGrade: 'V8' });
    });
    expect(result.current.stats?.climbsSentCount).toBe(12);
    expect(result.current.stats?.hardestGrade).toBe('V8');
  });

  it('updates the stat tiles live from a BoardStatsUpdated push (no re-fetch)', async () => {
    const harness = makeClient();
    const { result } = renderHook(() => useBoardPresence(1, harness.client));

    await act(async () => {
      await harness.resolveStats(1, { ...emptyStats, climbsSentCount: 2, distinctClimbersCount: 1 });
    });
    expect(result.current.stats?.climbsSentCount).toBe(2);

    // A tick landed on the wall: the server pushes a fresh snapshot over the
    // subscription. The tiles update without any new fetch call.
    act(() => {
      harness.emit(statsEvent(7, { climbsSentCount: 3, distinctClimbersCount: 2, hardestGrade: 'V9' }));
    });
    expect(result.current.stats?.climbsSentCount).toBe(3);
    expect(result.current.stats?.distinctClimbersCount).toBe(2);
    expect(result.current.stats?.hardestGrade).toBe('V9');
    // The one fetch was the initial seed only — live pushes don't re-fetch.
    expect(harness.fetchStats).toHaveBeenCalledTimes(1);
  });

  it('a live push that arrives before the seed wins; the late seed cannot clobber it', async () => {
    const harness = makeClient();
    const { result } = renderHook(() => useBoardPresence(1, harness.client));

    // Live stats land first (subscription is attached before the fetch resolves).
    act(() => {
      harness.emit(statsEvent(4, { climbsSentCount: 5 }));
    });
    expect(result.current.stats?.climbsSentCount).toBe(5);

    // The slower cold fetch resolves with a now-stale snapshot — it must not win.
    await act(async () => {
      await harness.resolveStats(1, { ...emptyStats, climbsSentCount: 1 });
    });
    expect(result.current.stats?.climbsSentCount).toBe(5);
  });

  it('flips isLive false when the subscription reports an error', async () => {
    const harness = makeClient();
    const { result } = renderHook(() => useBoardPresence(1, harness.client));
    expect(result.current.isLive).toBe(true);
    act(() => {
      harness.emitError(new Error('socket dropped'));
    });
    await waitFor(() => expect(result.current.isLive).toBe(false));
  });

  it('flips isLive false when the subscription completes', async () => {
    const harness = makeClient();
    const { result } = renderHook(() => useBoardPresence(1, harness.client));
    expect(result.current.isLive).toBe(true);
    act(() => {
      harness.emitComplete();
    });
    await waitFor(() => expect(result.current.isLive).toBe(false));
  });
});

describe('useBoardPresence — switching boards', () => {
  it('resets state, resubscribes, and ignores the old board’s late async', async () => {
    const harness = makeClient();
    const { result, rerender } = renderHook(({ boardId }) => useBoardPresence(boardId, harness.client), {
      initialProps: { boardId: 1 },
    });

    act(() => {
      harness.emit(setEvent(climb('board1', 9)));
    });
    expect(result.current.currentClimb?.climbUuid).toBe('board1');

    // Switch to board 2 BEFORE board 1's fetch resolves.
    rerender({ boardId: 2 });

    // State reset for the new board; resubscribed to board 2.
    expect(result.current.currentClimb).toBeNull();
    expect(result.current.history).toEqual([]);
    expect(harness.getSubscribedBoardId()).toBe(2);
    expect(harness.unsubscribe).toHaveBeenCalledTimes(1);

    // Board 1's late backfill resolves AFTER the switch — it must be ignored
    // (the stale-board guard rejects a result for a superseded boardId).
    await act(async () => {
      await harness.resolveRecent(1, [climb('board1-late', 3)]);
    });
    expect(result.current.history).toEqual([]);
    expect(result.current.currentClimb).toBeNull();

    // Board 2's own live event applies normally.
    act(() => {
      harness.emit(setEvent(climb('board2', 2)));
    });
    expect(result.current.currentClimb?.climbUuid).toBe('board2');
  });

  it('resets stats on board switch and ignores the old board’s late stats fetch', async () => {
    const harness = makeClient();
    const { result, rerender } = renderHook(({ boardId }) => useBoardPresence(boardId, harness.client), {
      initialProps: { boardId: 1 },
    });

    await act(async () => {
      await harness.resolveStats(1, { ...emptyStats, climbsSentCount: 7, hardestGrade: 'V7' });
    });
    expect(result.current.stats?.climbsSentCount).toBe(7);

    // Switch to board 2: the prior wall's tiles must not bleed into the next.
    rerender({ boardId: 2 });
    expect(result.current.stats).toBeNull();

    // A late stats fetch for board 1 resolving after the switch is ignored.
    await act(async () => {
      await harness.resolveStats(1, { ...emptyStats, climbsSentCount: 99 });
    });
    expect(result.current.stats).toBeNull();

    // Board 2's own stats seed populates normally.
    await act(async () => {
      await harness.resolveStats(2, { ...emptyStats, climbsSentCount: 1 });
    });
    expect(result.current.stats?.climbsSentCount).toBe(1);
  });

  it('unsubscribes on unmount', () => {
    const harness = makeClient();
    const { unmount } = renderHook(() => useBoardPresence(1, harness.client));
    expect(harness.unsubscribe).not.toHaveBeenCalled();
    unmount();
    expect(harness.unsubscribe).toHaveBeenCalledTimes(1);
  });
});

describe('useBoardPresence — actions', () => {
  it('reportClimb forwards the active boardId, climb, and angle', async () => {
    const harness = makeClient();
    const { result } = renderHook(() => useBoardPresence(3, harness.client));
    const input = { uuid: 'q1', climb: { uuid: 'c1' } } as never;

    await act(async () => {
      await result.current.reportClimb(input, 25);
    });

    expect(harness.reportClimb).toHaveBeenCalledWith(3, input, 25);
  });

  it('reportClimbWithUndoTarget captures the current climb before the report resolves', async () => {
    const harness = makeClient();
    const { result } = renderHook(() => useBoardPresence(3, harness.client));
    act(() => {
      harness.emit(setEvent(climb('restore-me', 1, { angle: 30, queueItemUuid: 'qi-restore' })));
    });

    let reportResult = { accepted: false, undoTarget: null as BoardPresenceClimb | null };
    await act(async () => {
      reportResult = await result.current.reportClimbWithUndoTarget(
        { uuid: 'q2', climb: { uuid: 'takeover' } } as never,
        40,
      );
    });

    expect(reportResult.accepted).toBe(true);
    expect(reportResult.undoTarget?.climbUuid).toBe('restore-me');
    expect(result.current.undoTarget?.climbUuid).toBe('restore-me');
    expect(result.current.getUndoTarget()?.climbUuid).toBe('restore-me');
  });
});

describe('BoardPresenceProvider — split contexts', () => {
  it('keeps action-only consumers stable when current/feed state changes', async () => {
    const harness = makeClient();
    const renderCounts = { actions: 0, current: 0, feed: 0 };
    const currentSnapshots: Array<ReturnType<typeof useBoardPresenceCurrent>> = [];
    const feedSnapshots: Array<ReturnType<typeof useBoardPresenceFeed>> = [];

    function ActionConsumer() {
      renderCounts.actions += 1;
      useBoardPresenceActions();
      return null;
    }

    function CurrentConsumer() {
      renderCounts.current += 1;
      currentSnapshots.push(useBoardPresenceCurrent());
      return null;
    }

    function FeedConsumer() {
      renderCounts.feed += 1;
      feedSnapshots.push(useBoardPresenceFeed());
      return null;
    }

    function Consumers() {
      return (
        <>
          <ActionConsumer />
          <CurrentConsumer />
          <FeedConsumer />
        </>
      );
    }

    render(
      <BoardPresenceProvider boardId={1} client={harness.client}>
        <Consumers />
      </BoardPresenceProvider>,
    );

    await waitFor(() => expect(currentSnapshots.at(-1)?.isLive).toBe(true));
    const actionRenderCountAfterAttach = renderCounts.actions;

    act(() => {
      harness.emit(setEvent(climb('live-context', 4)));
    });

    await waitFor(() => expect(currentSnapshots.at(-1)?.currentClimb?.climbUuid).toBe('live-context'));
    expect(feedSnapshots.at(-1)?.history.map((entry) => entry.climbUuid)).toEqual(['live-context']);
    expect(renderCounts.actions).toBe(actionRenderCountAfterAttach);
    expect(renderCounts.current).toBeGreaterThan(1);
    expect(renderCounts.feed).toBeGreaterThan(1);
  });
});
