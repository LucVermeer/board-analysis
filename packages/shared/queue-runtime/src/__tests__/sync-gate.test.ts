import { describe, it, expect, vi } from 'vitest';
import {
  createQueueSyncGate,
  hasContiguousReplayCoverage,
  RESYNC_LOOP_THRESHOLD,
  CORRUPTION_RESYNC_COOLDOWN_MS,
  type QueueSyncGateEvent,
} from '../sync-gate';

function fullSync(sequence: number, stateHash: string): QueueSyncGateEvent {
  return { __typename: 'FullSync', sequence, stateHash };
}

function delta(typename: string, sequence: number, stateHash: string): QueueSyncGateEvent {
  return { __typename: typename, sequence, stateHash };
}

function playbackStateChanged(sequence: number): QueueSyncGateEvent {
  return { __typename: 'PlaybackStateChanged', sequence };
}

describe('createQueueSyncGate', () => {
  describe('evaluateIncoming / noteApplied', () => {
    it('applies the first event unconditionally (lastSequence starts null)', () => {
      const gate = createQueueSyncGate();
      expect(gate.evaluateIncoming(delta('QueueItemAdded', 1, 'hash-1'))).toBe('apply');
    });

    it('applies in-order events and advances tracking via noteApplied', () => {
      const gate = createQueueSyncGate();
      const first = delta('QueueItemAdded', 1, 'hash-1');
      expect(gate.evaluateIncoming(first)).toBe('apply');
      gate.noteApplied(first);
      expect(gate.getLastSequence()).toBe(1);

      const second = delta('QueueItemRemoved', 2, 'hash-2');
      expect(gate.evaluateIncoming(second)).toBe('apply');
      gate.noteApplied(second);
      expect(gate.getLastSequence()).toBe(2);
    });

    it('ignores a stale duplicate event (sequence <= lastSequence)', () => {
      const gate = createQueueSyncGate();
      const first = delta('QueueItemAdded', 5, 'hash-5');
      gate.evaluateIncoming(first);
      gate.noteApplied(first);

      expect(gate.evaluateIncoming(delta('QueueItemAdded', 5, 'hash-5'))).toBe('ignore-stale');
      expect(gate.evaluateIncoming(delta('QueueItemAdded', 3, 'hash-3'))).toBe('ignore-stale');
      // Tracking is untouched by ignored events.
      expect(gate.getLastSequence()).toBe(5);
    });

    it('detects a sequence gap and reports resync-gap without advancing tracking', () => {
      const gate = createQueueSyncGate();
      const first = delta('QueueItemAdded', 1, 'hash-1');
      gate.evaluateIncoming(first);
      gate.noteApplied(first);

      // Jump straight to sequence 5 — a gap of missed events 2,3,4.
      expect(gate.evaluateIncoming(delta('QueueItemAdded', 5, 'hash-5'))).toBe('resync-gap');
      expect(gate.getLastSequence()).toBe(1);
    });

    it('FullSync always applies and resets tracking to the FullSync payload, even after a gap', () => {
      const gate = createQueueSyncGate();
      const first = delta('QueueItemAdded', 1, 'hash-1');
      gate.evaluateIncoming(first);
      gate.noteApplied(first);

      // A gap would normally block further deltas...
      expect(gate.evaluateIncoming(delta('QueueItemAdded', 9, 'hash-9'))).toBe('resync-gap');

      // ...but a FullSync always applies and re-baselines tracking.
      expect(gate.evaluateIncoming(fullSync(20, 'hash-20'))).toBe('apply');
      expect(gate.getLastSequence()).toBe(20);

      // Subsequent deltas are now sequenced against the FullSync's baseline.
      const next = delta('QueueItemAdded', 21, 'hash-21');
      expect(gate.evaluateIncoming(next)).toBe('apply');
    });

    it('FullSync resets tracking even as the very first event (no prior baseline)', () => {
      const gate = createQueueSyncGate();
      expect(gate.evaluateIncoming(fullSync(42, 'hash-42'))).toBe('apply');
      expect(gate.getLastSequence()).toBe(42);
    });

    it('PlaybackStateChanged always applies and never advances sequence/hash tracking', () => {
      const gate = createQueueSyncGate();
      const first = delta('QueueItemAdded', 1, 'hash-1');
      gate.evaluateIncoming(first);
      gate.noteApplied(first);

      // The server reuses the *current* sequence for playback events (no
      // queue mutation happened), so this looks like a stale duplicate by
      // sequence number alone — the gate must exempt it entirely.
      expect(gate.evaluateIncoming(playbackStateChanged(1))).toBe('apply');
      gate.noteApplied(playbackStateChanged(1));
      expect(gate.getLastSequence()).toBe(1);

      // A genuinely stale PlaybackStateChanged (lower sequence) still applies.
      expect(gate.evaluateIncoming(playbackStateChanged(0))).toBe('apply');
      expect(gate.getLastSequence()).toBe(1);

      // The next real delta at sequence 2 is still contiguous — proves the
      // playback event never silently occupied slot 2 or otherwise disturbed
      // the sequence dedup gate for the *following* real event.
      const next = delta('CurrentClimbChanged', 2, 'hash-2');
      expect(gate.evaluateIncoming(next)).toBe('apply');
    });
  });

  describe('verifyLocalHash', () => {
    it('returns ok with no server hash tracked yet', () => {
      const gate = createQueueSyncGate();
      expect(gate.verifyLocalHash('anything')).toEqual({ verdict: 'ok', consecutiveResyncs: 0 });
    });

    it('returns ok when the local hash matches the tracked server hash', () => {
      const gate = createQueueSyncGate();
      const event = fullSync(1, 'hash-a');
      gate.evaluateIncoming(event);

      expect(gate.verifyLocalHash('hash-a')).toEqual({ verdict: 'ok', consecutiveResyncs: 0 });
    });

    it('escalates through resync-drift for the first RESYNC_LOOP_THRESHOLD mismatches, then backs off', () => {
      const gate = createQueueSyncGate();
      gate.evaluateIncoming(fullSync(1, 'server-hash'));

      const results = Array.from({ length: RESYNC_LOOP_THRESHOLD + 2 }, () => gate.verifyLocalHash('local-hash'));

      for (let strike = 0; strike < RESYNC_LOOP_THRESHOLD; strike++) {
        expect(results[strike]).toEqual({ verdict: 'resync-drift', consecutiveResyncs: strike + 1 });
      }
      // Past the threshold: back off, but keep counting so the caller can see
      // the loop is still ongoing.
      expect(results[RESYNC_LOOP_THRESHOLD]).toEqual({
        verdict: 'backoff',
        consecutiveResyncs: RESYNC_LOOP_THRESHOLD + 1,
      });
      expect(results[RESYNC_LOOP_THRESHOLD + 1]).toEqual({
        verdict: 'backoff',
        consecutiveResyncs: RESYNC_LOOP_THRESHOLD + 2,
      });
    });

    it('recovers immediately once the hashes agree, resetting the strike counter', () => {
      const gate = createQueueSyncGate();
      gate.evaluateIncoming(fullSync(1, 'server-hash'));

      gate.verifyLocalHash('local-hash');
      gate.verifyLocalHash('local-hash');
      expect(gate.verifyLocalHash('server-hash')).toEqual({ verdict: 'ok', consecutiveResyncs: 0 });

      // A subsequent mismatch against the *same* server hash starts a fresh
      // streak at strike 1, not 3.
      expect(gate.verifyLocalHash('local-hash')).toEqual({ verdict: 'resync-drift', consecutiveResyncs: 1 });
    });

    it('restarts the strike counter when the server hash itself changes mid-streak', () => {
      const gate = createQueueSyncGate();
      gate.evaluateIncoming(fullSync(1, 'server-hash-a'));

      gate.verifyLocalHash('local-hash');
      gate.verifyLocalHash('local-hash');
      expect(gate.verifyLocalHash('local-hash')).toEqual({ verdict: 'resync-drift', consecutiveResyncs: 3 });

      // Server hash changes (e.g. a delta landed) — new drift streak, even
      // though the local hash is still mismatched.
      const next = delta('QueueItemAdded', 2, 'server-hash-b');
      gate.evaluateIncoming(next);
      gate.noteApplied(next);

      expect(gate.verifyLocalHash('local-hash')).toEqual({ verdict: 'resync-drift', consecutiveResyncs: 1 });
    });
  });

  describe('evaluateCorruption', () => {
    it('resyncs immediately on first corruption and starts a cooldown window', () => {
      const currentTime = 1_000;
      const gate = createQueueSyncGate({ now: () => currentTime });

      expect(gate.evaluateCorruption()).toBe('resync');
    });

    it('reports cooldown for corruption detected within the cooldown window, then resync once it expires', () => {
      let currentTime = 1_000;
      const gate = createQueueSyncGate({ now: () => currentTime });

      expect(gate.evaluateCorruption()).toBe('resync');

      currentTime += CORRUPTION_RESYNC_COOLDOWN_MS - 1;
      expect(gate.evaluateCorruption()).toBe('cooldown');

      currentTime += 1;
      expect(gate.evaluateCorruption()).toBe('resync');
    });

    it('defaults to Date.now when no clock is injected', () => {
      const dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(5_000);
      try {
        const gate = createQueueSyncGate();
        expect(gate.evaluateCorruption()).toBe('resync');
        expect(dateNowSpy).toHaveBeenCalled();
      } finally {
        dateNowSpy.mockRestore();
      }
    });
  });

  describe('decideReconnectStrategy', () => {
    it('full-syncs on first connection (lastSequence == null)', () => {
      const gate = createQueueSyncGate();
      expect(
        gate.decideReconnectStrategy({
          lastSequence: null,
          serverSequence: 10,
          serverStateHash: 'server-hash',
          localStateHash: 'local-hash',
        }),
      ).toBe('full-sync');
    });

    it('does nothing when gap is 0 and hashes match', () => {
      const gate = createQueueSyncGate();
      expect(
        gate.decideReconnectStrategy({
          lastSequence: 10,
          serverSequence: 10,
          serverStateHash: 'same-hash',
          localStateHash: 'same-hash',
        }),
      ).toBe('none');
    });

    it('full-syncs when gap is 0 but hashes mismatch', () => {
      const gate = createQueueSyncGate();
      expect(
        gate.decideReconnectStrategy({
          lastSequence: 10,
          serverSequence: 10,
          serverStateHash: 'server-hash',
          localStateHash: 'local-hash',
        }),
      ).toBe('full-sync');
    });

    it('delta-replays for a small gap (1..100)', () => {
      const gate = createQueueSyncGate();
      expect(
        gate.decideReconnectStrategy({
          lastSequence: 10,
          serverSequence: 11,
          serverStateHash: 'server-hash',
          localStateHash: 'local-hash',
        }),
      ).toBe('delta-replay');

      expect(
        gate.decideReconnectStrategy({
          lastSequence: 0,
          serverSequence: 100,
          serverStateHash: 'server-hash',
          localStateHash: 'local-hash',
        }),
      ).toBe('delta-replay');
    });

    it('full-syncs when the gap exceeds 100', () => {
      const gate = createQueueSyncGate();
      expect(
        gate.decideReconnectStrategy({
          lastSequence: 0,
          serverSequence: 101,
          serverStateHash: 'server-hash',
          localStateHash: 'local-hash',
        }),
      ).toBe('full-sync');
    });

    it('does nothing when the server-reported sequence is behind the last one applied (negative gap)', () => {
      // Matches web's current use-session-lifecycle.ts behaviour: none of
      // the gap>0/gap>100/lastSeq===null/gap===0 branches fire for a
      // negative gap, so the reconnect flow falls through with no resync.
      const gate = createQueueSyncGate();
      expect(
        gate.decideReconnectStrategy({
          lastSequence: 50,
          serverSequence: 40,
          serverStateHash: 'server-hash',
          localStateHash: 'local-hash',
        }),
      ).toBe('none');
    });

    it('is pure with respect to gate-tracked state — ignores getLastSequence() and only reads its input', () => {
      const gate = createQueueSyncGate();
      const first = delta('QueueItemAdded', 5, 'hash-5');
      gate.evaluateIncoming(first);
      gate.noteApplied(first);
      expect(gate.getLastSequence()).toBe(5);

      // Pass a completely different lastSequence than the gate's own
      // tracked value — the decision must follow the explicit input.
      expect(
        gate.decideReconnectStrategy({
          lastSequence: null,
          serverSequence: 5,
          serverStateHash: 'h',
          localStateHash: 'h',
        }),
      ).toBe('full-sync');
    });
  });

  describe('reset', () => {
    it('clears sequence/hash tracking, the resync-loop counter, and the corruption cooldown', () => {
      let currentTime = 1_000;
      const gate = createQueueSyncGate({ now: () => currentTime });

      const event = fullSync(10, 'server-hash');
      gate.evaluateIncoming(event);
      gate.verifyLocalHash('local-hash');
      gate.verifyLocalHash('local-hash');
      gate.evaluateCorruption();

      gate.reset();

      expect(gate.getLastSequence()).toBeNull();
      // A fresh mismatch streak starts at strike 1 again, not continuing
      // from 2.
      const event2 = fullSync(1, 'server-hash-2');
      gate.evaluateIncoming(event2);
      expect(gate.verifyLocalHash('local-hash')).toEqual({ verdict: 'resync-drift', consecutiveResyncs: 1 });

      // Corruption cooldown cleared too — an immediate check resyncs again
      // rather than reporting cooldown.
      currentTime += 1;
      expect(gate.evaluateCorruption()).toBe('resync');
    });

    it('evaluateIncoming treats the next event as the first again after reset', () => {
      const gate = createQueueSyncGate();
      const first = delta('QueueItemAdded', 1, 'hash-1');
      gate.evaluateIncoming(first);
      gate.noteApplied(first);

      gate.reset();

      // Would have been ignore-stale before reset; now it's the first event.
      expect(gate.evaluateIncoming(delta('QueueItemAdded', 1, 'hash-1'))).toBe('apply');
    });
  });
});

describe('hasContiguousReplayCoverage', () => {
  // Scenario shapes ported from
  // `packages/web/app/components/persistent-session/__tests__/session-lifecycle-replay.test.ts`,
  // using a minimal `{ __typename, sequence }` shape since this function
  // doesn't need the full event payload.
  it('returns true immediately when currentSequence <= sinceSequence', () => {
    expect(hasContiguousReplayCoverage([], 8, 8)).toBe(true);
    expect(hasContiguousReplayCoverage([], 8, 5)).toBe(true);
  });

  it('rejects replay coverage with a missing sequence', () => {
    const events = [
      { __typename: 'QueueItemAdded', sequence: 6 },
      { __typename: 'CurrentClimbChanged', sequence: 8 },
    ];

    expect(hasContiguousReplayCoverage(events, 5, 8)).toBe(false);
  });

  it('allows FullSync to cover earlier missing sequences and same-sequence controller events', () => {
    const events = [
      { __typename: 'FullSync', sequence: 8 },
      { __typename: 'CurrentClimbChanged', sequence: 8 },
    ];

    expect(hasContiguousReplayCoverage(events, 5, 8)).toBe(true);
  });

  it('handles reverse-order FullSync + same-sequence delta from the backend', () => {
    const events = [
      { __typename: 'CurrentClimbChanged', sequence: 8 },
      { __typename: 'FullSync', sequence: 8 },
    ];

    expect(hasContiguousReplayCoverage(events, 5, 8)).toBe(true);
  });

  it('handles QueueItemAdded co-sequenced with a FullSync (delta arrives first)', () => {
    const events = [
      { __typename: 'QueueItemAdded', sequence: 8 },
      { __typename: 'FullSync', sequence: 8 },
    ];

    expect(hasContiguousReplayCoverage(events, 5, 8)).toBe(true);
  });

  it('returns true for exactly-contiguous coverage across multiple deltas', () => {
    const events = [
      { __typename: 'QueueItemAdded', sequence: 6 },
      { __typename: 'QueueItemRemoved', sequence: 7 },
      { __typename: 'CurrentClimbChanged', sequence: 8 },
    ];

    expect(hasContiguousReplayCoverage(events, 5, 8)).toBe(true);
  });

  it('returns false when a later FullSync leaves a gap before currentSequence', () => {
    const events = [
      { __typename: 'FullSync', sequence: 6 },
      { __typename: 'QueueItemAdded', sequence: 7 },
      // Missing sequence 8 and 9 — currentSequence is 10.
      { __typename: 'CurrentClimbChanged', sequence: 10 },
    ];

    expect(hasContiguousReplayCoverage(events, 5, 10)).toBe(false);
  });
});
