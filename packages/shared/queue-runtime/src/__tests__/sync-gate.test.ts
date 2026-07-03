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
  it('pins the ported web constants so silent threshold drift fails a test', () => {
    // These mirror web's RESYNC_LOOP_THRESHOLD (use-session-subscriptions.ts)
    // and CORRUPTION_RESYNC_COOLDOWN_MS (persistent-session/types.ts). The
    // behavioral tests below derive from the exported constants, so without
    // this pin a 3→5 or 30s→10s change would still pass everything.
    expect(RESYNC_LOOP_THRESHOLD).toBe(3);
    expect(CORRUPTION_RESYNC_COOLDOWN_MS).toBe(30_000);
  });

  describe('evaluateIncoming / noteApplied', () => {
    it('applies the first event unconditionally (lastSequence starts null)', () => {
      const gate = createQueueSyncGate();
      expect(gate.evaluateIncoming(delta('QueueItemAdded', 1, 'hash-1'))).toBe('apply');
    });

    it('bypasses the gate for a delta with no sequence number (never ignore-stale)', () => {
      const gate = createQueueSyncGate();
      const first = delta('QueueItemAdded', 5, 'hash-5');
      gate.evaluateIncoming(first);
      gate.noteApplied(first);

      // A caller whose subscription doesn't select `sequence` must not have
      // its events coerced to 0 and dropped as stale after the first one.
      const unsequenced: QueueSyncGateEvent = { __typename: 'QueueItemAdded' };
      expect(gate.evaluateIncoming(unsequenced)).toBe('apply');
      expect(gate.evaluateIncoming(unsequenced)).toBe('apply');
      // Tracking is untouched — noteApplied has nothing to advance with.
      gate.noteApplied(unsequenced);
      expect(gate.getLastSequence()).toBe(5);
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
      expect(gate.verifyLocalHash({ stateHash: 'anything' })).toEqual({
        verdict: 'ok',
        consecutiveResyncs: 0,
        serverHash: null,
      });
    });

    it('returns ok when the local hash matches the tracked server hash', () => {
      const gate = createQueueSyncGate();
      const event = fullSync(1, 'hash-a');
      gate.evaluateIncoming(event);

      expect(gate.verifyLocalHash({ stateHash: 'hash-a' })).toEqual({
        verdict: 'ok',
        consecutiveResyncs: 0,
        serverHash: 'hash-a',
      });
    });

    it('escalates through resync-drift for the first RESYNC_LOOP_THRESHOLD mismatches, then backs off', () => {
      const gate = createQueueSyncGate();
      gate.evaluateIncoming(fullSync(1, 'server-hash'));

      const results = Array.from({ length: RESYNC_LOOP_THRESHOLD + 2 }, () =>
        gate.verifyLocalHash({ stateHash: 'local-hash' }),
      );

      for (let strike = 0; strike < RESYNC_LOOP_THRESHOLD; strike++) {
        expect(results[strike]).toEqual({
          verdict: 'resync-drift',
          consecutiveResyncs: strike + 1,
          serverHash: 'server-hash',
        });
      }
      // Past the threshold: back off, but keep counting so the caller can see
      // the loop is still ongoing.
      expect(results[RESYNC_LOOP_THRESHOLD]).toEqual({
        verdict: 'backoff',
        consecutiveResyncs: RESYNC_LOOP_THRESHOLD + 1,
        serverHash: 'server-hash',
      });
      expect(results[RESYNC_LOOP_THRESHOLD + 1]).toEqual({
        verdict: 'backoff',
        consecutiveResyncs: RESYNC_LOOP_THRESHOLD + 2,
        serverHash: 'server-hash',
      });
    });

    it('recovers immediately once the hashes agree, resetting the strike counter', () => {
      const gate = createQueueSyncGate();
      gate.evaluateIncoming(fullSync(1, 'server-hash'));

      gate.verifyLocalHash({ stateHash: 'local-hash' });
      gate.verifyLocalHash({ stateHash: 'local-hash' });
      expect(gate.verifyLocalHash({ stateHash: 'server-hash' })).toEqual({
        verdict: 'ok',
        consecutiveResyncs: 0,
        serverHash: 'server-hash',
      });

      // A subsequent mismatch against the *same* server hash starts a fresh
      // streak at strike 1, not 3.
      expect(gate.verifyLocalHash({ stateHash: 'local-hash' })).toEqual({
        verdict: 'resync-drift',
        consecutiveResyncs: 1,
        serverHash: 'server-hash',
      });
    });

    it('restarts the strike counter when the server hash itself changes mid-streak', () => {
      const gate = createQueueSyncGate();
      gate.evaluateIncoming(fullSync(1, 'server-hash-a'));

      gate.verifyLocalHash({ stateHash: 'local-hash' });
      gate.verifyLocalHash({ stateHash: 'local-hash' });
      expect(gate.verifyLocalHash({ stateHash: 'local-hash' })).toEqual({
        verdict: 'resync-drift',
        consecutiveResyncs: 3,
        serverHash: 'server-hash-a',
      });

      // Server hash changes (e.g. a delta landed) — new drift streak, even
      // though the local hash is still mismatched. The reported serverHash
      // follows the gate's tracking so a wired Sentry report never needs a
      // parallel copy of it.
      const next = delta('QueueItemAdded', 2, 'server-hash-b');
      gate.evaluateIncoming(next);
      gate.noteApplied(next);

      expect(gate.verifyLocalHash({ stateHash: 'local-hash' })).toEqual({
        verdict: 'resync-drift',
        consecutiveResyncs: 1,
        serverHash: 'server-hash-b',
      });
    });
  });

  // X1: the whole point of the order-sensitive (v2) hash — a reorder that keeps
  // the same members produces the SAME v1 hash but a DIFFERENT ordered hash.
  // These tests prove v1's blind spot and v2's fix, and that the dual-hash
  // preference degrades cleanly to v1 when either side lacks an ordered hash.
  describe('verifyLocalHash — dual-hash (v2 ordered) preference', () => {
    // A reorder drift: identical v1 (members unchanged), diverging ordered.
    const V1_SAME = 'v1-shared';
    const ORDERED_SERVER = 'ordered-server';
    const ORDERED_LOCAL = 'ordered-local-diverged';

    function fullSyncDual(sequence: number, stateHash: string, stateHashOrdered: string): QueueSyncGateEvent {
      return { __typename: 'FullSync', sequence, stateHash, stateHashOrdered };
    }

    it('CATCHES reorder drift (same v1, different ordered) as resync-drift when ordered hashes are present', () => {
      const gate = createQueueSyncGate();
      gate.evaluateIncoming(fullSyncDual(1, V1_SAME, ORDERED_SERVER));

      // v1 matches — the v1-only watchdog would have called this 'ok' (its blind
      // spot). With ordered hashes on both sides the gate compares them and sees
      // the divergence.
      expect(gate.verifyLocalHash({ stateHash: V1_SAME, stateHashOrdered: ORDERED_LOCAL })).toEqual({
        verdict: 'resync-drift',
        consecutiveResyncs: 1,
        // The reported serverHash is the ACTIVE (ordered) comparison hash.
        serverHash: ORDERED_SERVER,
      });
    });

    it("does NOT catch the same reorder drift when only v1 hashes are present (proves v1's blind spot)", () => {
      const gate = createQueueSyncGate();
      // Old backend: FullSync carries only v1, no ordered hash.
      gate.evaluateIncoming(fullSync(1, V1_SAME));

      // Even though the caller has a diverged ordered hash, the server never sent
      // one, so the gate falls back to v1 — which matches → 'ok'. This is exactly
      // the reorder-drift the 60s watchdog used to miss entirely.
      expect(gate.verifyLocalHash({ stateHash: V1_SAME, stateHashOrdered: ORDERED_LOCAL })).toEqual({
        verdict: 'ok',
        consecutiveResyncs: 0,
        serverHash: V1_SAME,
      });
    });

    it('falls back to v1 when the caller omits the local ordered hash (old client, new backend)', () => {
      const gate = createQueueSyncGate();
      gate.evaluateIncoming(fullSyncDual(1, V1_SAME, ORDERED_SERVER));

      // Caller passes only v1 → cannot compare ordered → v1 comparison, matches.
      expect(gate.verifyLocalHash({ stateHash: V1_SAME })).toEqual({
        verdict: 'ok',
        consecutiveResyncs: 0,
        serverHash: V1_SAME,
      });
    });

    it('reports ok via the ordered path when both ordered hashes agree', () => {
      const gate = createQueueSyncGate();
      gate.evaluateIncoming(fullSyncDual(1, V1_SAME, ORDERED_SERVER));

      expect(gate.verifyLocalHash({ stateHash: V1_SAME, stateHashOrdered: ORDERED_SERVER })).toEqual({
        verdict: 'ok',
        consecutiveResyncs: 0,
        serverHash: ORDERED_SERVER,
      });
    });

    it('tracks the ordered hash through a delta via noteApplied, then catches ordered drift', () => {
      const gate = createQueueSyncGate();
      gate.evaluateIncoming(fullSyncDual(1, 'v1-a', 'ordered-a'));

      const reorder: QueueSyncGateEvent = {
        __typename: 'QueueReordered',
        sequence: 2,
        // A pure reorder: v1 unchanged, ordered advanced.
        stateHash: 'v1-a',
        stateHashOrdered: 'ordered-b',
      };
      expect(gate.evaluateIncoming(reorder)).toBe('apply');
      gate.noteApplied(reorder);

      // Local still has the pre-reorder ordering → ordered mismatch caught.
      expect(gate.verifyLocalHash({ stateHash: 'v1-a', stateHashOrdered: 'ordered-a' })).toEqual({
        verdict: 'resync-drift',
        consecutiveResyncs: 1,
        serverHash: 'ordered-b',
      });
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

    // The recovery half of the reorder-drift fix: at the same sequence with an
    // equal v1 hash but a diverged ordered hash, the reconnect must full-sync so
    // the client's queue is actually re-ordered — not just detected as drifted.
    it('full-syncs at gap 0 when v1 hashes match but the ordered (v2) hashes diverge', () => {
      const gate = createQueueSyncGate();
      expect(
        gate.decideReconnectStrategy({
          lastSequence: 10,
          serverSequence: 10,
          serverStateHash: 'same-v1',
          localStateHash: 'same-v1',
          serverStateHashOrdered: 'ordered-server',
          localStateHashOrdered: 'ordered-local-diverged',
        }),
      ).toBe('full-sync');
    });

    it('does nothing at gap 0 when both v1 and ordered hashes match', () => {
      const gate = createQueueSyncGate();
      expect(
        gate.decideReconnectStrategy({
          lastSequence: 10,
          serverSequence: 10,
          serverStateHash: 'same-v1',
          localStateHash: 'same-v1',
          serverStateHashOrdered: 'same-ordered',
          localStateHashOrdered: 'same-ordered',
        }),
      ).toBe('none');
    });

    it('falls back to v1 at gap 0 when ordered hashes are not both present (old backend)', () => {
      const gate = createQueueSyncGate();
      // Server sent no ordered hash: a diverged local ordered hash is ignored,
      // v1 matches → 'none' (exactly the pre-dual-hash behaviour).
      expect(
        gate.decideReconnectStrategy({
          lastSequence: 10,
          serverSequence: 10,
          serverStateHash: 'same-v1',
          localStateHash: 'same-v1',
          localStateHashOrdered: 'ordered-local-diverged',
        }),
      ).toBe('none');
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

    it('full-syncs when the server-reported sequence is behind the last one applied (negative gap)', () => {
      // MIGRATED from the old 'none' assertion (carried in from the W3 review):
      // a negative gap means the backend re-seeded its sequence counter LOW
      // (restart with Redis lost / a dormant Postgres row), leaving this client
      // permanently ahead. Under the old 'none' verdict every later delta looked
      // stale against the client's higher tracked sequence and was dropped
      // forever ('ignore-stale' loop). A full-sync re-baselines the client to
      // the server's authoritative state and recovers it.
      const gate = createQueueSyncGate();
      expect(
        gate.decideReconnectStrategy({
          lastSequence: 50,
          serverSequence: 40,
          serverStateHash: 'server-hash',
          localStateHash: 'local-hash',
        }),
      ).toBe('full-sync');
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
      gate.verifyLocalHash({ stateHash: 'local-hash' });
      gate.verifyLocalHash({ stateHash: 'local-hash' });
      gate.evaluateCorruption();

      gate.reset();

      expect(gate.getLastSequence()).toBeNull();
      // A fresh mismatch streak starts at strike 1 again, not continuing
      // from 2.
      const event2 = fullSync(1, 'server-hash-2');
      gate.evaluateIncoming(event2);
      expect(gate.verifyLocalHash({ stateHash: 'local-hash' })).toEqual({
        verdict: 'resync-drift',
        consecutiveResyncs: 1,
        serverHash: 'server-hash-2',
      });

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
