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
  /** Order-insensitive hash (v1). */
  stateHash?: string | null;
  /** Order-SENSITIVE hash (v2). Optional during the dual-hash rollout: an old
   *  backend omits it and the gate falls back to comparing v1; a new backend
   *  always sends it and the gate prefers ordered-vs-ordered so a reorder that
   *  diverges is finally caught (v1 is blind to reorders). */
  stateHashOrdered?: string | null;
};

/**
 * The pair of locally-computed hashes the watchdog passes to `verifyLocalHash`.
 * `stateHash` (v1) is always present; `stateHashOrdered` (v2) is present once
 * the platform computes it. The gate compares ordered-vs-ordered only when BOTH
 * the server sent an ordered hash and this local ordered hash is present —
 * otherwise it falls back to the v1 comparison, so behaviour is identical to
 * today's against an old backend.
 */
export type LocalStateHashes = {
  stateHash: string;
  stateHashOrdered?: string | null;
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
  /** The server hash the local hash was compared against, or `null` when
   *  nothing was tracked yet. This is the *active* comparison hash: the
   *  tracked ordered (v2) server hash when the gate compared ordered-vs-ordered,
   *  otherwise the tracked v1 server hash. Web's Sentry drift report includes
   *  it (`use-session-subscriptions.ts:150-160`) — returning it here keeps
   *  callers from mirroring the exact value the gate exists to own. */
  serverHash: string | null;
};

export type CorruptionVerdict = 'resync' | 'cooldown';

export type ReconnectStrategy = 'none' | 'delta-replay' | 'full-sync';

export type ReconnectStrategyInput = {
  lastSequence: number | null;
  serverSequence: number;
  serverStateHash: string;
  localStateHash: string;
  /** Order-sensitive (v2) hashes. Optional during the dual-hash rollout: when
   *  BOTH are present the `gap === 0` branch compares them instead of v1, so a
   *  pure reorder drift (identical members, same sequence, equal v1 hash but
   *  diverged order) triggers a recovering `'full-sync'` — v1 alone returns
   *  `'none'` and would leave the client detecting the drift forever without
   *  fixing it. Omitting either falls back to the exact v1 comparison. */
  serverStateHashOrdered?: string | null;
  localStateHashOrdered?: string | null;
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
   * Periodic watchdog: compare freshly computed local hashes against the last
   * known server hashes. Prefers the order-sensitive (v2) comparison when the
   * server sent an ordered hash AND the caller provides a local ordered hash;
   * otherwise falls back to the v1 comparison (identical to pre-dual-hash
   * behaviour against an old backend). Tracks consecutive resyncs against the
   * *active* comparison server hash and backs off after `RESYNC_LOOP_THRESHOLD`
   * strikes.
   */
  verifyLocalHash(local: LocalStateHashes): HashVerifyResult;
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
  // Order-sensitive (v2) server hash, tracked alongside v1. Stays null against
  // an old backend that never sends one, which is exactly what makes
  // `verifyLocalHash` fall back to the v1 comparison there.
  let lastServerStateHashOrdered: string | null = null;

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
    // Skipping a null stateHash diverges (unreachably, with current web
    // types — every gated delta carries a non-null stateHash) from web's
    // unconditional `setLastReceivedStateHash(event.stateHash)` assignment.
    if (event.stateHash != null) {
      lastServerStateHash = event.stateHash;
      // Mixed-signal hardening for a rolling deploy. The backend sends BOTH
      // hashes on every queue-mutating event, so a delta that carries a v1
      // stateHash but NO ordered hash came from an OLD backend instance still
      // draining mid-rollout. Sync the ordered tracking to exactly what THIS
      // delta carried: track it when present, and CLEAR any ordered hash a
      // prior (new-backend) FullSync seeded when absent. Without the clear,
      // `verifyLocalHash`/`decideReconnectStrategy` would keep preferring the
      // ordered comparison and match local-ordered against a now-stale FullSync
      // ordered value; clearing makes both fall back to the v1 comparison, which
      // the same delta just refreshed. (The invariant makes the clear a no-op in
      // practice — it only fires against a genuinely old, ordered-less backend.)
      lastServerStateHashOrdered = event.stateHashOrdered ?? null;
    } else if (event.stateHashOrdered != null) {
      // A v1-less event that still carries an ordered hash isn't produced by the
      // real backend (both or neither), but keep tracking it rather than dropping
      // the signal — mirrors the pre-hardening tolerance for a lone hash.
      lastServerStateHashOrdered = event.stateHashOrdered;
    }
  }

  return {
    evaluateIncoming(event) {
      if (event.__typename === 'FullSync') {
        lastSequence = event.sequence ?? null;
        lastServerStateHash = event.stateHash ?? null;
        // Re-baseline the ordered hash too. A FullSync from an old backend
        // carries no ordered hash → null → verifyLocalHash compares v1.
        lastServerStateHashOrdered = event.stateHashOrdered ?? null;
        return 'apply';
      }

      if (event.__typename === 'PlaybackStateChanged') {
        return 'apply';
      }

      // A delta with no sequence number can't be sequence-gated: coercing
      // null to 0 would classify every such event after the first as
      // 'ignore-stale' and silently drop it (e.g. a mobile caller whose
      // subscription doesn't select `sequence`). Bypass the gate instead —
      // an ungated apply matches the pre-gate behaviour for such callers.
      if (event.sequence == null) {
        return 'apply';
      }

      const sequenceDecision = evaluateQueueEventSequence(lastSequence, event.sequence);
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

    verifyLocalHash(local) {
      // Prefer the order-sensitive comparison only when BOTH sides have an
      // ordered hash: the server sent one (new backend) and the caller computed
      // one. Otherwise fall back to v1 — identical to the pre-dual-hash
      // behaviour, so an old backend (no server ordered hash) keeps working and
      // a caller that only passes v1 keeps working. The chosen pair is compared
      // and the *active* server hash keys the resync-loop counter, so a reorder
      // that changes only the ordered hash resets/advances the streak correctly.
      const preferOrdered = lastServerStateHashOrdered != null && local.stateHashOrdered != null;
      const serverHash = preferOrdered ? lastServerStateHashOrdered : lastServerStateHash;
      const localHash = preferOrdered ? (local.stateHashOrdered as string) : local.stateHash;

      if (serverHash === null || localHash === serverHash) {
        // Hashes agree (or nothing to compare against yet) — reset the loop
        // counter so future drift starts fresh.
        resyncLoopHash = null;
        consecutiveResyncCount = 0;
        return { verdict: 'ok', consecutiveResyncs: 0, serverHash };
      }

      if (resyncLoopHash === serverHash) {
        consecutiveResyncCount += 1;
      } else {
        resyncLoopHash = serverHash;
        consecutiveResyncCount = 1;
      }

      const verdict: HashVerifyVerdict = consecutiveResyncCount <= RESYNC_LOOP_THRESHOLD ? 'resync-drift' : 'backoff';
      return { verdict, consecutiveResyncs: consecutiveResyncCount, serverHash };
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

    decideReconnectStrategy({
      lastSequence: lastSeq,
      serverSequence,
      serverStateHash,
      localStateHash,
      serverStateHashOrdered,
      localStateHashOrdered,
    }) {
      if (lastSeq === null) {
        return 'full-sync';
      }

      const gap = serverSequence - lastSeq;

      // NOTE: web's original delta-replay branch also required a truthy
      // sessionId (falsy → no resync at all); the wiring workstream must
      // handle missing-sessionId itself before acting on 'delta-replay'.
      if (gap > 0 && gap <= 100) {
        return 'delta-replay';
      }
      if (gap > 100) {
        return 'full-sync';
      }
      if (gap === 0) {
        // Same sequence: only a hash mismatch means state diverged. Prefer the
        // order-sensitive comparison when both ordered hashes are present so a
        // pure reorder (equal v1 hash, diverged order) still full-syncs and
        // RECOVERS — not just gets detected by the watchdog. Falls back to v1
        // against an old backend / a caller that didn't pass ordered hashes.
        const preferOrdered = serverStateHashOrdered != null && localStateHashOrdered != null;
        const serverHash = preferOrdered ? (serverStateHashOrdered as string) : serverStateHash;
        const localHash = preferOrdered ? (localStateHashOrdered as string) : localStateHash;
        return localHash !== serverHash ? 'full-sync' : 'none';
      }

      // gap < 0: the freshly rejoined session reports a sequence *behind* what
      // this client already applied. This happens when the backend restarts and
      // re-seeds sequence counters low (e.g. Redis lost, Postgres row dormant) —
      // the client is then permanently ahead and, under the old 'none' verdict,
      // would sit in 'ignore-stale' forever, dropping every subsequent delta
      // because they all look stale against its higher tracked sequence. A
      // full-sync re-baselines the client to the server's authoritative state
      // and recovers it. (Carried in from the W3 review — the ported web chain
      // fell through to no resync here, which is the bug this fixes.)
      return 'full-sync';
    },

    reset() {
      lastSequence = null;
      lastServerStateHash = null;
      lastServerStateHashOrdered = null;
      resyncLoopHash = null;
      consecutiveResyncCount = 0;
      // Deliberate per-session scoping: web's `lastCorruptionResyncRef`
      // survived session changes (it lived in the provider, not the
      // lifecycle effect), but a fresh session deserves a fresh cooldown.
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
