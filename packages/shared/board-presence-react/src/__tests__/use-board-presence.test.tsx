import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { BoardPresenceClimb, BoardPresenceEvent, BoardPresenceStats } from '@boardsesh/shared-schema';
import { useBoardPresence } from '../use-board-presence';
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

const emptyStats: BoardPresenceStats = {
  climbsSentCount: 0,
  distinctClimbersCount: 0,
  hardestGrade: null,
  topGrade: null,
  lastSentAt: null,
};

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
    ): (() => void) => {
      subscribedBoardId = boardId;
      onEvent = handler;
      onError = errorHandler ?? null;
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
    emit: (event: BoardPresenceEvent) => onEvent?.(event),
    emitError: (err: unknown) => onError?.(err),
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

  it('report/undo no-op (resolve false) when inert', async () => {
    const { result } = renderHook(() => useBoardPresence(null, null));
    await expect(result.current.reportClimb({ uuid: 'q', climb: { uuid: 'c' } } as never, 40)).resolves.toBe(false);
    await expect(result.current.undo()).resolves.toBe(false);
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

  it('flips isLive false when the subscription reports an error', async () => {
    const harness = makeClient();
    const { result } = renderHook(() => useBoardPresence(1, harness.client));
    expect(result.current.isLive).toBe(true);
    act(() => {
      harness.emitError(new Error('socket dropped'));
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

  it('undo re-reports the previous climb when one exists', async () => {
    const harness = makeClient();
    const { result } = renderHook(() => useBoardPresence(3, harness.client));

    // Two sets: the first becomes `previousClimb` after the second.
    act(() => {
      harness.emit(setEvent(climb('first', 1, { angle: 30, queueItemUuid: 'qi-first' })));
    });
    act(() => {
      harness.emit(setEvent(climb('second', 2)));
    });
    expect(result.current.currentClimb?.climbUuid).toBe('second');
    expect(result.current.previousClimb?.climbUuid).toBe('first');

    await act(async () => {
      await result.current.undo();
    });

    expect(harness.reportClimb).toHaveBeenCalledTimes(1);
    // Re-reports the previous climb: queue-item uuid carried through, the climb
    // uuid reconstructed into ClimbInput, and the previous angle forwarded.
    expect(harness.reportClimb).toHaveBeenCalledWith(
      3,
      expect.objectContaining({ uuid: 'qi-first', climb: expect.objectContaining({ uuid: 'first' }) }),
      30,
    );
  });

  it('undo is a no-op (resolves false) when there is no previous climb', async () => {
    const harness = makeClient();
    const { result } = renderHook(() => useBoardPresence(3, harness.client));
    await expect(result.current.undo()).resolves.toBe(false);
    expect(harness.reportClimb).not.toHaveBeenCalled();
  });
});
