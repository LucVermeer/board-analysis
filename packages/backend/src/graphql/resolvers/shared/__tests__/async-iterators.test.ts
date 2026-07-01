/**
 * Regression tests for the subscription async-iterator helpers' bounded
 * queue (A5). A consumer that never reads (or reads too slowly) must not let
 * the in-memory queue grow unbounded — the oldest events are dropped once the
 * queue hits MAX_SUBSCRIPTION_QUEUE_SIZE (1000), and the drop is logged with
 * the caller-supplied label instead of an unconditional per-event warn.
 */

import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';

const { warnMock } = vi.hoisted(() => ({ warnMock: vi.fn() }));

vi.mock('../../../../utils/logger', () => ({
  logger: { warn: warnMock, error: vi.fn(), info: vi.fn() },
}));

import { createAsyncIterator, createEagerAsyncIterator } from '../async-iterators';

describe('async-iterators overflow', () => {
  beforeEach(() => {
    warnMock.mockClear();
  });

  it('createAsyncIterator: 1001 pushes with no consumer drops the oldest, retains the newest 1000, and logs the first drop with the label', async () => {
    let push!: (value: number) => void;
    const iterable = await createAsyncIterator<number>(async (pushFn) => {
      push = pushFn;
      return () => {};
    }, 'test-label');

    for (let value = 1; value <= 1001; value++) {
      push(value);
    }

    const iterator = iterable[Symbol.asyncIterator]();
    const drained: number[] = [];
    for (let index = 0; index < 1000; index++) {
      const { value, done } = await iterator.next();
      expect(done).toBe(false);
      drained.push(value);
    }

    // Oldest (1) was dropped; the newest 1000 events (2..1001) survive, in order.
    expect(drained[0]).toBe(2);
    expect(drained[drained.length - 1]).toBe(1001);
    expect(drained).toHaveLength(1000);

    expect(warnMock).toHaveBeenCalledTimes(1);
    expect(warnMock.mock.calls[0][0]).toContain('test-label');
    expect(warnMock.mock.calls[0][0]).toContain('1 dropped so far');
  });

  it('createAsyncIterator: logs the first drop and every 100th thereafter, not every drop', async () => {
    let push!: (value: number) => void;
    const iterable = await createAsyncIterator<number>(async (pushFn) => {
      push = pushFn;
      return () => {};
    }, 'flood-label');

    // 1000 to fill the queue, then 250 more overflow pushes (drops 1..250).
    for (let value = 1; value <= 1250; value++) {
      push(value);
    }
    void iterable;

    // Drops 1, 100, 200 logged; 250 not yet (waits for the next multiple of 100).
    expect(warnMock).toHaveBeenCalledTimes(3);
    expect(warnMock.mock.calls[0][0]).toContain('1 dropped so far');
    expect(warnMock.mock.calls[1][0]).toContain('100 dropped so far');
    expect(warnMock.mock.calls[2][0]).toContain('200 dropped so far');
  });

  it('createAsyncIterator: defaults the label to "unknown" when the caller omits it', async () => {
    let push!: (value: number) => void;
    const iterable = await createAsyncIterator<number>(async (pushFn) => {
      push = pushFn;
      return () => {};
    });
    void iterable;

    for (let value = 1; value <= 1001; value++) {
      push(value);
    }

    expect(warnMock).toHaveBeenCalledTimes(1);
    expect(warnMock.mock.calls[0][0]).toContain('unknown');
  });

  it('createEagerAsyncIterator: 1001 pushes with no consumer drops the oldest, retains the newest 1000, and logs with the label', async () => {
    let push!: (value: number) => void;
    const iterable = await createEagerAsyncIterator<number>(async (pushFn) => {
      push = pushFn;
      return () => {};
    }, 'boardNowPlaying:42');

    for (let value = 1; value <= 1001; value++) {
      push(value);
    }

    const iterator = iterable[Symbol.asyncIterator]();
    const drained: number[] = [];
    for (let index = 0; index < 1000; index++) {
      const { value, done } = await iterator.next();
      expect(done).toBe(false);
      drained.push(value);
    }

    expect(drained[0]).toBe(2);
    expect(drained[drained.length - 1]).toBe(1001);
    expect(drained).toHaveLength(1000);

    expect(warnMock).toHaveBeenCalledTimes(1);
    expect(warnMock.mock.calls[0][0]).toContain('boardNowPlaying:42');
  });

  it('does not log anything when the queue never overflows', async () => {
    let push!: (value: number) => void;
    const iterable = await createAsyncIterator<number>(async (pushFn) => {
      push = pushFn;
      return () => {};
    }, 'quiet-label');
    void iterable;

    for (let value = 1; value <= 999; value++) {
      push(value);
    }

    expect(warnMock).not.toHaveBeenCalled();
  });
});
