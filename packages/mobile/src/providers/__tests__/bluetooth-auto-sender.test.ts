import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ClimbQueueItem, Climb } from '@boardsesh/queue';

// ── Factory helpers ────────────────────────────────────────────────────

function makeClimb(uuid: string, frames = `p1r${uuid.charCodeAt(0)}`): Climb {
  return {
    uuid,
    name: `Climb ${uuid}`,
    frames,
    setter_username: 'setter',
    angle: 40,
    ascensionist_count: 0,
    difficulty: 'V3',
    quality_average: '3.0',
    stars: 3,
    difficulty_error: '0.3',
    benchmark_difficulty: null,
  };
}

function makeQueueItem(uuid: string, frames?: string): ClimbQueueItem {
  return {
    uuid,
    climb: makeClimb(uuid, frames),
  };
}

// ── Drain loop recreation ──────────────────────────────────────────────
// Extracts the core algorithm from BluetoothAutoSender without React.
// The component uses refs + effects; here we model the same state as
// plain variables and drive the loop with an explicit `enqueue` function.

type DrainContext = {
  /** Enqueue a climb. If the loop isn't writing, starts a drain. */
  enqueue: (item: ClimbQueueItem) => void;
  /** Number of completed sendFramesToBoard calls */
  sendCallCount: () => number;
  /** UUIDs passed to sendFramesToBoard, in call order */
  sentUuids: () => string[];
  /** Resolve the currently in-flight write (simulates BLE latency) */
  resolveCurrentWrite: () => void;
  /** Flush all microtasks so drain loop iterations settle */
  flush: () => Promise<void>;
  /** Abort the drain loop (simulates component unmount) */
  abort: () => void;
};

function createDrainLoop(sendDuration: 'instant' | 'deferred' = 'deferred'): DrainContext {
  let isWriting = false;
  let pendingClimb: ClimbQueueItem | null = null;
  let lastSentUuid: string | null = null;

  const abortController = new AbortController();
  const sentUuidsList: string[] = [];
  let totalSendCalls = 0;

  // When sendDuration is 'deferred', writes hang until resolveCurrentWrite()
  // is called. When 'instant', writes resolve immediately.
  let currentWriteResolve: (() => void) | null = null;

  const sendFramesToBoard = vi.fn(
    (_frames: string, _mirrored: boolean, _signal?: AbortSignal): Promise<boolean | undefined> => {
      totalSendCalls++;
      if (sendDuration === 'instant') {
        return Promise.resolve(true);
      }
      return new Promise<boolean | undefined>((resolve) => {
        currentWriteResolve = () => resolve(true);
      });
    },
  );

  const drain = async (startItem: ClimbQueueItem) => {
    let toSend: ClimbQueueItem | null = startItem;
    const signal = abortController.signal;

    try {
      while (toSend) {
        if (signal.aborted) return;
        const item = toSend;

        // Dedup same-uuid re-broadcasts
        if (item.climb.uuid === lastSentUuid) {
          toSend = pendingClimb;
          pendingClimb = null;
          continue;
        }

        sentUuidsList.push(item.climb.uuid);
        const result = await sendFramesToBoard(item.climb.frames, !!item.climb.mirrored, signal);

        if (signal.aborted) return;

        if (result === true) {
          lastSentUuid = item.climb.uuid;
        }

        toSend = pendingClimb;
        pendingClimb = null;
      }
    } finally {
      isWriting = false;
    }
  };

  return {
    enqueue(item: ClimbQueueItem) {
      if (abortController.signal.aborted) return;

      if (isWriting) {
        pendingClimb = item;
        return;
      }

      isWriting = true;
      void drain(item);
    },

    sendCallCount: () => totalSendCalls,

    sentUuids: () => [...sentUuidsList],

    resolveCurrentWrite() {
      currentWriteResolve?.();
      currentWriteResolve = null;
    },

    async flush() {
      // Let microtasks settle
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    },

    abort() {
      abortController.abort();
    },
  };
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('BluetoothAutoSender drain loop', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('basic send', () => {
    it('sends a single climb immediately', async () => {
      const loop = createDrainLoop('instant');

      loop.enqueue(makeQueueItem('climb-1'));
      await loop.flush();

      expect(loop.sendCallCount()).toBe(1);
      expect(loop.sentUuids()).toEqual(['climb-1']);
    });

    it('sends multiple sequential climbs when each completes before the next arrives', async () => {
      const loop = createDrainLoop('instant');

      loop.enqueue(makeQueueItem('climb-1'));
      await loop.flush();

      loop.enqueue(makeQueueItem('climb-2'));
      await loop.flush();

      loop.enqueue(makeQueueItem('climb-3'));
      await loop.flush();

      expect(loop.sendCallCount()).toBe(3);
      expect(loop.sentUuids()).toEqual(['climb-1', 'climb-2', 'climb-3']);
    });
  });

  describe('latest-wins coalescing', () => {
    it('only sends the last climb when multiple arrive during a write', async () => {
      const loop = createDrainLoop('deferred');

      // First climb starts writing
      loop.enqueue(makeQueueItem('climb-1'));

      // These arrive while climb-1 is still writing — each replaces the previous pending
      loop.enqueue(makeQueueItem('climb-2'));
      loop.enqueue(makeQueueItem('climb-3'));
      loop.enqueue(makeQueueItem('climb-4'));

      // Complete the write for climb-1
      loop.resolveCurrentWrite();
      await loop.flush();

      // Now climb-4 (the latest) should start writing
      loop.resolveCurrentWrite();
      await loop.flush();

      // climb-2 and climb-3 were replaced — only climb-1 and climb-4 were sent
      expect(loop.sentUuids()).toEqual(['climb-1', 'climb-4']);
      expect(loop.sendCallCount()).toBe(2);
    });

    it('pending climb overwrites previous pending climb', async () => {
      const loop = createDrainLoop('deferred');

      loop.enqueue(makeQueueItem('first'));

      // Two rapid enqueues while first is writing
      loop.enqueue(makeQueueItem('second'));
      loop.enqueue(makeQueueItem('third'));

      // Complete first write
      loop.resolveCurrentWrite();
      await loop.flush();

      // Only third should be pending (second was replaced)
      loop.resolveCurrentWrite();
      await loop.flush();

      expect(loop.sentUuids()).toEqual(['first', 'third']);
    });
  });

  describe('same-UUID deduplication', () => {
    it('skips re-sending the same climb UUID consecutively', async () => {
      const loop = createDrainLoop('instant');

      loop.enqueue(makeQueueItem('climb-A'));
      await loop.flush();

      // Same UUID again — should be deduped
      loop.enqueue(makeQueueItem('climb-A'));
      await loop.flush();

      expect(loop.sendCallCount()).toBe(1);
      expect(loop.sentUuids()).toEqual(['climb-A']);
    });

    it('deduplicates pending climb with same UUID as just-sent climb', async () => {
      const loop = createDrainLoop('deferred');

      loop.enqueue(makeQueueItem('alpha'));

      // While alpha is writing, enqueue the same UUID
      loop.enqueue(makeQueueItem('alpha'));

      // Complete the first write
      loop.resolveCurrentWrite();
      await loop.flush();

      // The pending alpha should be skipped (same UUID as lastSent)
      expect(loop.sendCallCount()).toBe(1);
      expect(loop.sentUuids()).toEqual(['alpha']);
    });

    it('allows re-sending a UUID after a different one was sent in between', async () => {
      const loop = createDrainLoop('instant');

      loop.enqueue(makeQueueItem('climb-X'));
      await loop.flush();

      loop.enqueue(makeQueueItem('climb-Y'));
      await loop.flush();

      // climb-X again — should be sent because climb-Y was sent in between
      loop.enqueue(makeQueueItem('climb-X'));
      await loop.flush();

      expect(loop.sendCallCount()).toBe(3);
      expect(loop.sentUuids()).toEqual(['climb-X', 'climb-Y', 'climb-X']);
    });
  });

  describe('abort signal (unmount)', () => {
    it('stops the drain loop when abort is called', async () => {
      const loop = createDrainLoop('deferred');

      loop.enqueue(makeQueueItem('climb-1'));

      // Enqueue a pending climb
      loop.enqueue(makeQueueItem('climb-2'));

      // Abort before completing the first write
      loop.abort();
      loop.resolveCurrentWrite();
      await loop.flush();

      // Only climb-1 was attempted; climb-2 never started
      expect(loop.sentUuids()).toEqual(['climb-1']);
      expect(loop.sendCallCount()).toBe(1);
    });

    it('ignores enqueues after abort', async () => {
      const loop = createDrainLoop('instant');

      loop.abort();
      loop.enqueue(makeQueueItem('climb-1'));
      await loop.flush();

      expect(loop.sendCallCount()).toBe(0);
      expect(loop.sentUuids()).toEqual([]);
    });

    it('does not process pending climb after abort even if write resolves', async () => {
      const loop = createDrainLoop('deferred');

      loop.enqueue(makeQueueItem('first'));
      loop.enqueue(makeQueueItem('second'));

      // Abort mid-write
      loop.abort();

      // Let the write resolve — the loop should exit without processing 'second'
      loop.resolveCurrentWrite();
      await loop.flush();

      expect(loop.sentUuids()).toEqual(['first']);
    });
  });

  describe('serialization (isWriting guard)', () => {
    it('does not start a second write while one is in progress', async () => {
      const loop = createDrainLoop('deferred');

      // Start writing climb-1
      loop.enqueue(makeQueueItem('climb-1'));

      // This should be queued as pending, not start a new write
      loop.enqueue(makeQueueItem('climb-2'));

      // At this point only 1 sendFramesToBoard call should exist
      expect(loop.sendCallCount()).toBe(1);

      // Complete the first write
      loop.resolveCurrentWrite();
      await loop.flush();

      // Now climb-2 should start
      expect(loop.sendCallCount()).toBe(2);

      // Complete the second write
      loop.resolveCurrentWrite();
      await loop.flush();

      expect(loop.sentUuids()).toEqual(['climb-1', 'climb-2']);
    });

    it('releases the isWriting lock after the drain loop finishes', async () => {
      const loop = createDrainLoop('instant');

      loop.enqueue(makeQueueItem('a'));
      await loop.flush();

      // After drain completes, a new enqueue should start a fresh drain
      loop.enqueue(makeQueueItem('b'));
      await loop.flush();

      expect(loop.sendCallCount()).toBe(2);
      expect(loop.sentUuids()).toEqual(['a', 'b']);
    });

    it('releases the isWriting lock even if sendFramesToBoard throws', async () => {
      // Custom loop where sendFramesToBoard rejects
      let isWriting = false;
      let pendingClimb: ClimbQueueItem | null = null;
      let lastSentUuid: string | null = null;
      const sentUuidsList: string[] = [];
      let callCount = 0;
      let shouldFail = true;

      const sendFn = async (_frames: string): Promise<boolean> => {
        callCount++;
        if (shouldFail) {
          throw new Error('BLE write failed');
        }
        return true;
      };

      const drain = async (startItem: ClimbQueueItem) => {
        let toSend: ClimbQueueItem | null = startItem;
        try {
          while (toSend) {
            const item = toSend;

            if (item.climb.uuid === lastSentUuid) {
              toSend = pendingClimb;
              pendingClimb = null;
              continue;
            }

            sentUuidsList.push(item.climb.uuid);
            try {
              const result = await sendFn(item.climb.frames);
              if (result === true) {
                lastSentUuid = item.climb.uuid;
              }
            } catch {
              // Error handled, continue drain
            }

            toSend = pendingClimb;
            pendingClimb = null;
          }
        } finally {
          isWriting = false;
        }
      };

      const enqueue = (item: ClimbQueueItem) => {
        if (isWriting) {
          pendingClimb = item;
          return;
        }
        isWriting = true;
        void drain(item);
      };

      const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

      // First call fails
      enqueue(makeQueueItem('fail-climb'));
      await flush();

      // isWriting should be false again despite the error
      shouldFail = false;
      enqueue(makeQueueItem('success-climb'));
      await flush();

      expect(callCount).toBe(2);
      expect(sentUuidsList).toEqual(['fail-climb', 'success-climb']);
    });
  });

  describe('dedup + latest-wins combined', () => {
    it('skips deduped pending and picks up the next different climb', async () => {
      const loop = createDrainLoop('deferred');

      // Send climb-A
      loop.enqueue(makeQueueItem('climb-A'));
      loop.resolveCurrentWrite();
      await loop.flush();

      // Now start climb-B
      loop.enqueue(makeQueueItem('climb-B'));

      // While climb-B is writing, user goes back to climb-A then climb-C
      loop.enqueue(makeQueueItem('climb-A'));
      loop.enqueue(makeQueueItem('climb-C'));

      // Complete climb-B
      loop.resolveCurrentWrite();
      await loop.flush();

      // climb-C should be pending (climb-A was replaced by climb-C via latest-wins)
      loop.resolveCurrentWrite();
      await loop.flush();

      expect(loop.sentUuids()).toEqual(['climb-A', 'climb-B', 'climb-C']);
    });
  });
});
