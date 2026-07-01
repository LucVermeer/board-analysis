// Pure "resync decider" for queue subscription sync. One shared module both
// web and mobile will adopt in a later workstream — this file only creates
// the decider + tests; wiring it into either platform's hooks is out of
// scope here.
//
// Web currently spreads five overlapping resync triggers across
// `packages/web/app/components/persistent-session/hooks/*`. This module
// ports their exact decision logic (not the React/effect plumbing around
// them) so both platforms can share one source of truth:
//
//   1. Sequence-gap detection on incoming queue events (`evaluateIncoming` +
//      `noteApplied`) — ported from `use-event-processor.ts:80-213`.
//   2. Corrupted-item detection with a cooldown (`evaluateCorruption`) —
//      ported from `use-session-subscriptions.ts:55-96`.
//   3. Periodic local-vs-server hash verification with 3-strike backoff
//      (`verifyLocalHash`) — ported from `use-session-subscriptions.ts:98-180`.
//   4. Reconnect strategy selection: none / delta-replay / full-sync
//      (`decideReconnectStrategy`) — ported from
//      `use-session-lifecycle.ts:519-609`.
//   5. Replay-coverage validation (`hasContiguousReplayCoverage`) — MOVED
//      verbatim from `use-session-lifecycle.ts:146-189`; web now re-exports
//      it from here instead of defining it locally.
//
// Closure-factory style matching `createJoinSessionTracker` in
// `ensure-joined.ts`: no React, no DOM, no timers of its own. Callers own
// their `setInterval`/effect wiring (and, for `verifyLocalHash`, their own
// Sentry reporting) and just ask the gate what to do next.

import { evaluateQueueEventSequence } from '@boardsesh/queue';

/** Same threshold as the web watchdog: once a local hash mismatch has
 *  triggered this many consecutive resyncs against the *same* server hash
 *  without the drift resolving, back off instead of resyncing forever
 *  (the resync itself is a server-side no-op once this happens — see
 *  `use-session-subscriptions.ts:160-166` / issue #2359). */
export const RESYNC_LOOP_THRESHOLD = 3;

/** Minimum time between corruption-triggered resyncs. Mirrors
 *  `CORRUPTION_RESYNC_COOLDOWN_MS` in
 *  `packages/web/app/components/persistent-session/types.ts`. Duplicated
 *  (not imported) — shared packages must not depend on `packages/web`. */
export const CORRUPTION_RESYNC_COOLDOWN_MS = 30_000;

/**
 * Flattened incoming-event envelope the gate reasons about. Callers flatten
 * their richer wire types into this shape before calling `evaluateIncoming`/
 * `noteApplied` — e.g. for `FullSync`, pass `stateHash: event.state.stateHash`
 * since the real wire event nests it under `state`; `PlaybackStateChanged`
 * naturally has no `stateHash` to pass since it doesn't mutate the queue.
 */
export type QueueSyncGateEvent = {
  __typename: string;
  sequence?: number | null;
  stateHash?: string | null;
};

export type IncomingEventDecision = 'apply' | 'ignore-stale' | 'resync-gap';

export type HashVerifyVerdict = 'ok' | 'resync-drift' | 'backoff';

export type HashVerifyResult = {
  verdict: HashVerifyVerdict;
  /** Consecutive mismatches against the current server hash; `0` when
   *  `verdict` is `'ok'`. A caller reports to Sentry exactly once per drift
   *  streak by checking `consecutiveResyncs === RESYNC_LOOP_THRESHOLD`
   *  (the same one-shot point `use-session-subscriptions.ts` reports at). */
  consecutiveResyncs: number;
};

export type CorruptionVerdict = 'resync' | 'cooldown';

export type ReconnectStrategy = 'none' | 'delta-replay' | 'full-sync';

export type ReconnectStrategyInput = {
  lastSequence: number | null;
  serverSequence: number;
  serverStateHash: string;
  localStateHash: string;
};

export type QueueSyncGateOptions = {
  /** Injected clock for testability. Defaults to `Date.now`. */
  now?: () => number;
};

export type QueueSyncGate = {
  /**
   * Sequence-gate an incoming queue event.
   *
   * `FullSync` always applies and resets sequence/hash tracking to the
   * event's own values.
   *
   * `PlaybackStateChanged` is exempt: always `'apply'`, and never advances
   * tracking. The server stamps it with the *current* sequence number (it
   * doesn't mutate the queue, so the room manager doesn't bump) — routing it
   * through the dedup gate below would mark every event after the first as
   * stale and silently drop party-mode playback sync
   * (`use-event-processor.ts:82-115`).
   *
   * All other event types are checked against the tracked `lastSequence`;
   * call `noteApplied` after actually applying the resulting mutation to
   * advance tracking (mirrors `use-event-processor.ts:199-207`, where the
   * sequence/hash update happens *after* the switch that applies the delta).
   */
  evaluateIncoming(event: QueueSyncGateEvent): IncomingEventDecision;
  /**
   * Advance `lastSequence`/`lastServerStateHash` after the caller applied a
   * delta event that `evaluateIncoming` returned `'apply'` for. No-op for
   * `PlaybackStateChanged` (see `evaluateIncoming`).
   */
  noteApplied(event: QueueSyncGateEvent): void;
  /**
   * Periodic watchdog: compare a freshly computed local hash against the
   * last known server hash. Tracks consecutive resyncs against the same
   * server hash and backs off after `RESYNC_LOOP_THRESHOLD` strikes.
   */
  verifyLocalHash(localHash: string): HashVerifyResult;
  /**
   * Corrupted (null/undefined) queue item detected locally. Returns
   * `'cooldown'` when a corruption-triggered resync already happened within
   * the last `CORRUPTION_RESYNC_COOLDOWN_MS`, otherwise `'resync'` and starts
   * a new cooldown window.
   */
  evaluateCorruption(): CorruptionVerdict;
  /**
   * Pick a reconnect strategy from a freshly rejoined session's sequence and
   * hash vs. what this client last saw. Pure with respect to gate state — it
   * only reads `input`, so callers can pass an explicit `lastSequence`
   * snapshot rather than relying on `getLastSequence()`.
   */
  decideReconnectStrategy(input: ReconnectStrategyInput): ReconnectStrategy;
  /** Clear all tracking. Call on session change or socket close. */
  reset(): void;
  /** Last sequence number tracked, or `null` before the first event/FullSync.
   *  Web's offline reconciliation reads this. */
  getLastSequence(): number | null;
};

export function createQueueSyncGate(options: QueueSyncGateOptions = {}): QueueSyncGate {
  const clock = options.now ?? Date.now;

  let lastSequence: number | null = null;
  let lastServerStateHash: string | null = null;

  let resyncLoopHash: string | null = null;
  let consecutiveResyncCount = 0;

  // Sentinel is -Infinity (not 0) so the *first* corruption check always
  // resyncs regardless of the injected clock's starting value — web's
  // `useRef<number>(0)` sentinel only works because real `Date.now()` epoch
  // millis always dwarf the 30s cooldown, which doesn't hold for an
  // arbitrary test clock starting near zero.
  let lastCorruptionResyncAt = Number.NEGATIVE_INFINITY;

  function advanceTracking(event: QueueSyncGateEvent): void {
    if (event.sequence != null) {
      lastSequence = event.sequence;
    }
    if (event.stateHash != null) {
      lastServerStateHash = event.stateHash;
    }
  }

  return {
    evaluateIncoming(event) {
      if (event.__typename === 'FullSync') {
        lastSequence = event.sequence ?? null;
        lastServerStateHash = event.stateHash ?? null;
        return 'apply';
      }

      if (event.__typename === 'PlaybackStateChanged') {
        return 'apply';
      }

      const sequenceDecision = evaluateQueueEventSequence(lastSequence, event.sequence ?? 0);
      if (sequenceDecision === 'ignore-stale') {
        return 'ignore-stale';
      }
      if (sequenceDecision === 'gap') {
        return 'resync-gap';
      }
      return 'apply';
    },

    noteApplied(event) {
      if (event.__typename === 'PlaybackStateChanged') {
        return;
      }
      advanceTracking(event);
    },

    verifyLocalHash(localHash) {
      if (lastServerStateHash === null || localHash === lastServerStateHash) {
        // Hashes agree (or nothing to compare against yet) — reset the loop
        // counter so future drift starts fresh.
        resyncLoopHash = null;
        consecutiveResyncCount = 0;
        return { verdict: 'ok', consecutiveResyncs: 0 };
      }

      if (resyncLoopHash === lastServerStateHash) {
        consecutiveResyncCount += 1;
      } else {
        resyncLoopHash = lastServerStateHash;
        consecutiveResyncCount = 1;
      }

      const verdict: HashVerifyVerdict = consecutiveResyncCount <= RESYNC_LOOP_THRESHOLD ? 'resync-drift' : 'backoff';
      return { verdict, consecutiveResyncs: consecutiveResyncCount };
    },

    evaluateCorruption() {
      const nowMs = clock();
      const elapsedMs = nowMs - lastCorruptionResyncAt;
      if (elapsedMs < CORRUPTION_RESYNC_COOLDOWN_MS) {
        return 'cooldown';
      }
      lastCorruptionResyncAt = nowMs;
      return 'resync';
    },

    decideReconnectStrategy({ lastSequence: lastSeq, serverSequence, serverStateHash, localStateHash }) {
      if (lastSeq === null) {
        return 'full-sync';
      }

      const gap = serverSequence - lastSeq;

      if (gap > 0 && gap <= 100) {
        return 'delta-replay';
      }
      if (gap > 100) {
        return 'full-sync';
      }
      if (gap === 0) {
        return localStateHash !== serverStateHash ? 'full-sync' : 'none';
      }

      // gap < 0: the freshly rejoined session reports a sequence *behind*
      // what this client already applied. Web's
      // `use-session-lifecycle.ts:555-609` if/else-if chain has no branch
      // for this case — `gap > 0 && gap <= 100` and `gap > 100` both fail
      // (gap is negative), `lastSeq === null` fails (we're in the `else`
      // already), and `gap === 0` fails too, so the chain falls straight
      // through with no resync at all before `setSession`/resubscribe.
      // Match that behaviour exactly instead of assuming a full-sync.
      return 'none';
    },

    reset() {
      lastSequence = null;
      lastServerStateHash = null;
      resyncLoopHash = null;
      consecutiveResyncCount = 0;
      lastCorruptionResyncAt = Number.NEGATIVE_INFINITY;
    },

    getLastSequence() {
      return lastSequence;
    },
  };
}

/**
 * Verify that a set of replay events gives contiguous coverage from
 * `sinceSequence` (exclusive) through `currentSequence` (inclusive), with no
 * gaps. MOVED verbatim from
 * `packages/web/app/components/persistent-session/hooks/use-session-lifecycle.ts:146-189`
 * — `use-session-lifecycle.ts` now imports this instead of defining it
 * locally, so its existing tests keep passing unchanged.
 */
export function hasContiguousReplayCoverage<TEvent extends { __typename: string; sequence: number }>(
  events: TEvent[],
  sinceSequence: number,
  currentSequence: number,
): boolean {
  if (currentSequence <= sinceSequence) {
    return true;
  }

  let expectedSequence = sinceSequence + 1;
  // FullSync and CurrentClimbChanged can share a sequence number when a
  // controller-issued climb change races with a snapshot. Process FullSync
  // first within a tie so the snapshot establishes the new expected sequence
  // before the same-sequence delta is checked — otherwise the delta would
  // fail the `event.sequence !== expectedSequence` invariant and we'd
  // wrongly report a gap. We can't rely on sort stability for this — even
  // with ECMAScript 2019's stable sort, the assertion still depends on the
  // caller's insertion order, which is not contractual.
  const sortedEvents = [...events].sort((a, b) => {
    if (a.sequence !== b.sequence) return a.sequence - b.sequence;
    if (a.__typename === 'FullSync' && b.__typename !== 'FullSync') return -1;
    if (b.__typename === 'FullSync' && a.__typename !== 'FullSync') return 1;
    return 0;
  });

  for (const event of sortedEvents) {
    if (event.sequence < expectedSequence) {
      continue;
    }

    if (event.__typename === 'FullSync') {
      expectedSequence = event.sequence + 1;
      continue;
    }

    if (event.sequence !== expectedSequence) {
      return false;
    }

    expectedSequence++;
  }

  return expectedSequence > currentSequence;
}
