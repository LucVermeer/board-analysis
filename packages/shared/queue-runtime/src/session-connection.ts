// Pure-TS session connection controller: connect -> join -> subscribe ->
// reconnect -> subscription-error recovery -> retry exhaustion.
//
// Extracted from web's
// `packages/web/app/components/persistent-session/hooks/use-session-lifecycle.ts`
// (Workstream W4). That hook owned this whole orchestration inline, in one
// ~900-line effect with nested closures and a pile of `MutableRefObject`s
// (`mountedRef`, `isConnectingRef`, `isReconnectingRef`,
// `connectionGenerationRef`, `queueUnsubscribeRef`, `sessionUnsubscribeRef`)
// used purely to guard against stale-async continuations after the effect
// tore down or re-ran for a new session. None of that needs React — this
// module ports the *exact* control flow (cited by original line numbers in
// the comments below) into closure state owned by one controller instance
// per connection attempt.
//
// Ownership split (documented once here; see `use-session-lifecycle.ts` for
// the React-binding half):
//   - Controller owns: client lifecycle, JOIN_SESSION (via
//     `createJoinSessionTracker`), delta-replay vs. full-sync selection,
//     subscription wiring + error/complete recovery with backoff, retry
//     exhaustion.
//   - Hook owns: React state (`session`, `client`, `isConnecting`,
//     `hasConnected`, `error`), session-event application
//     (`applySessionEvent`/roster), IndexedDB persistence, and the shared
//     sync gate's lifecycle (created once per provider mount, RESET by the
//     hook's effect cleanup — not by this controller — because the gate is
//     also consumed by `use-event-processor.ts` and
//     `use-session-subscriptions.ts`, so only the gate's owner should reset
//     it).
//
// Generation guard mapping: the original `connectionGenerationRef` existed
// because ALL connection state (refs) was shared across every effect run —
// a stale async continuation from a superseded effect run needed a way to
// tell "am I still the current generation?" separate from "has the
// component unmounted?" (`mountedRef`). Here, a brand-new controller
// instance is created per effect run (see the hook), so there is no shared
// state to disambiguate: a single `stopped` boolean, flipped synchronously
// by `stop()`, is both "am I unmounted" AND "has a newer generation
// superseded me" — a superseding effect run's cleanup calls `stop()` on
// THIS controller before the new one is created. `mountedRef` and
// `connectionGenerationRef` checks throughout the original hook collapse to
// this one `stopped` check.
//
// Join-epoch mapping: `createJoinSessionTracker` (`ensure-joined.ts`) caches
// the in-flight JOIN_SESSION promise keyed by (sessionId, epoch); the epoch
// must bump whenever the underlying connection is replaced so a stale
// cached join from the dead connection is never reused. Web has no direct
// socket 'closed' event to hook (see `createClient` below) — the earliest
// point web can act is `onReconnect`, fired once graphql-ws has already
// re-established the new connection. Bumping the epoch at the top of
// `handleReconnect` achieves the same invariant the 'closed' handler
// documents: any join cached against the previous connection is discarded
// before rejoining.

import { createJoinSessionTracker } from './ensure-joined';
import { hasContiguousReplayCoverage } from './sync-gate';
import type { QueueSyncGate } from './sync-gate';

/** Minimal structural requirement on the transport client — the controller
 *  never touches anything else on it directly (every GraphQL-specific
 *  concern lives in the injected ports below). */
export type SessionConnectionClient = {
  dispose(): void | Promise<void>;
};

/** Minimal shape of a joined/rejoined session the controller reasons about.
 *  Platform session types (web's `Session`) satisfy this structurally. */
export type SessionConnectionSessionData = {
  queueState: {
    sequence: number;
    stateHash: string;
  };
};

export type SessionConnectionSink<TEvent> = {
  next(event: TEvent): void;
  error(error: unknown): void;
  complete(): void;
};

export type SessionConnectionReplayResult<TQueueEvent> = {
  events: TQueueEvent[];
  currentSequence: number;
};

/** Only the two gate methods `use-session-lifecycle.ts` actually calls
 *  (`getLastSequence`, `decideReconnectStrategy`) — the fuller `QueueSyncGate`
 *  interface (hash watchdog, corruption cooldown) belongs to
 *  `use-event-processor.ts` / `use-session-subscriptions.ts`, not here. A
 *  real `QueueSyncGate` satisfies this structurally, so callers just pass
 *  the shared instance through. */
export type SessionConnectionGate = Pick<QueueSyncGate, 'getLastSequence' | 'decideReconnectStrategy'>;

export type SessionConnectionRetryPolicy = {
  initialRetryDelayMs: number;
  maxRetryDelayMs: number;
  backoffMultiplier: number;
  maxTransientRetries: number;
};

// Opaque — the controller only round-trips whatever `scheduleTimer` returns
// back into `clearTimer`, never inspects it. Keeping this `unknown` (rather
// than pinned to `ReturnType<typeof setTimeout>`) lets test doubles hand
// back plain numbers without a cast.
export type SessionConnectionTimerHandle = unknown;

/** Why `onFatal` fired — lets the hook's implementation log/report with
 *  context without the controller needing to know about consoles or
 *  Sentry. */
export type SessionConnectionFatalReason =
  | 'transient-retries-exhausted'
  | 'subscription-retries-exhausted'
  | 'connect-failed';

export type SessionConnectionDeps<
  TClient extends SessionConnectionClient,
  TSessionData extends SessionConnectionSessionData,
  TQueueEvent extends { __typename: string; sequence: number },
  TSessionEvent,
> = {
  /** Stable for this controller's whole lifetime — one controller per
   *  (session, connection attempt), matching the original hook's per-effect
   *  `sessionId` closure variable. */
  sessionId: string;
  /** Create a fresh transport client. `onReconnect` is invoked once per
   *  underlying reconnect (i.e. every `connected` event after the first) —
   *  mirrors `createGraphQLClient({ onReconnect })` in
   *  `use-session-lifecycle.ts:730-735`. */
  createClient: (onReconnect: () => void) => TClient;
  /** Fire the JOIN_SESSION mutation and return the joined session, or
   *  `null` on a failure the caller has already handled/logged (including
   *  session-ended — see `use-session-lifecycle.ts:475-489`). Wrapped in
   *  `createJoinSessionTracker` internally so a rapid reconnect racing an
   *  in-flight join collapses into one call instead of two. */
  join: (client: TClient) => Promise<TSessionData | null>;
  /** Best-effort LEAVE_SESSION mutation fired from `stop({ sendLeave: true
   *  })` before disposing the client. Mirrors
   *  `execute(clientToCleanup, { query: LEAVE_SESSION }, 5000)` in
   *  `use-session-lifecycle.ts:868`. */
  leave: (client: TClient) => Promise<void>;
  /** EVENTS_REPLAY for the delta-sync path. Returned events must already be
   *  in the same shape `onQueueEvent` expects (web pre-transforms via
   *  `transformToSubscriptionEvent` before returning). `null`/a thrown
   *  error are both treated as "replay unavailable" — the caller falls back
   *  to full sync either way. */
  replayEvents: (client: TClient, sinceSequence: number) => Promise<SessionConnectionReplayResult<TQueueEvent> | null>;
  /** Subscribe to the queue-updates subscription. Returns an unsubscribe
   *  function. The sink receives already-unwrapped events (the platform
   *  port strips the `{ queueUpdates: ... }` GraphQL envelope). */
  subscribeQueue: (client: TClient, sink: SessionConnectionSink<TQueueEvent>) => () => void;
  /** Subscribe to the session-updates subscription. Same unwrap contract as
   *  `subscribeQueue`. */
  subscribeSession: (client: TClient, sink: SessionConnectionSink<TSessionEvent>) => () => void;
  gate: SessionConnectionGate;
  /** Synchronous local queue-state hash, fed into
   *  `gate.decideReconnectStrategy`. Mirrors
   *  `computeQueueStateHash(queueRef.current, currentClimbQueueItemRef.current?.uuid || null)`
   *  in `use-session-lifecycle.ts:530`. */
  getLocalStateHash: () => string;
  /** Apply a full-sync snapshot from freshly (re)joined session data.
   *  Mirrors the `applyFullSync` local helper in
   *  `use-session-lifecycle.ts:603-611` — the controller can't construct a
   *  platform `FullSync` event itself since `TQueueEvent` is opaque here. */
  applyFullSync: (sessionData: TSessionData) => void;
  /** Fired at the top of every `connect()` attempt (initial + each retry).
   *  Mirrors `setIsConnecting(true); setError(null);` in
   *  `use-session-lifecycle.ts:726-727`. */
  onConnectStart: () => void;
  /** Fired once a client/session pair is ready to use — on the initial
   *  join success AND every successful rejoin. Mirrors `setClient(client);
   *  ...; setSession(sessionData); setHasConnected(true);
   *  setIsConnecting(false);` (`use-session-lifecycle.ts:751-774`) and
   *  `setSession(sessionData)` on reconnect (`:593`). Deliberately bundles
   *  `client` in here instead of surfacing it the moment it's created
   *  (`:751`, before join) — nothing downstream (`useQueueMutations`) can
   *  act on a client without a non-null `session` anyway, so the two are
   *  safe to hand over together. */
  onSessionData: (client: TClient, sessionData: TSessionData) => void;
  /** A queue event arrived (live subscription or replay). */
  onQueueEvent: (event: TQueueEvent) => void;
  /** A session event arrived (live subscription only — replay never
   *  carries session events). */
  onSessionEvent: (event: TSessionEvent) => void;
  /** A connect attempt failed, or the queue subscription errored. NOT
   *  called for session-subscription errors — matches the original hook's
   *  asymmetry (`use-session-lifecycle.ts:660-667` calls `setError`;
   *  `:702-706` does not). */
  onError: (error: unknown) => void;
  /** Unrecoverable: the hook should clear the persisted/active session.
   *  Mirrors the three `removePreference(...); setActiveSession(null);`
   *  call sites at `:797-803` (transient retries exhausted), `:619-625`
   *  (subscription retries exhausted), and `:824-827` (non-transient
   *  connect failure). */
  onFatal: (reason: SessionConnectionFatalReason) => void;
  retryPolicy: SessionConnectionRetryPolicy;
  /** Injectable for tests (fake timers). Defaults to the real
   *  `setTimeout`/`clearTimeout`. */
  scheduleTimer?: (callback: () => void, delayMs: number) => SessionConnectionTimerHandle;
  clearTimer?: (handle: SessionConnectionTimerHandle) => void;
};

export type SessionConnectionController = {
  /** Kick off the initial connect. Fire-and-forget, matching the original
   *  hook's `void connect();` (`use-session-lifecycle.ts:835`). */
  start(): void;
  /** Tear down: cancel pending timers, unsubscribe, optionally LEAVE_SESSION,
   *  dispose the client. Mirrors the effect cleanup at
   *  `use-session-lifecycle.ts:837-891`, MINUS the sync-gate reset and
   *  `lastReceivedSequenceRef` clear — those stay hook-owned (see the
   *  module doc comment's ownership split). Safe to call even if `start()`
   *  was never called, or more than once. */
  stop(options: { sendLeave: boolean }): void;
  /** Force a reconnect/resync cycle. Mirrors
   *  `triggerResyncRef.current = handleReconnect` (`:601`) — the hook wires
   *  this into `useSessionSubscriptions`' `triggerResync` action. */
  triggerResync(): void;
};

/** Internal sentinel distinguishing "join returned no payload" (retry with
 *  backoff, matching `TransientJoinError` in the original
 *  `errors.ts`/`use-session-lifecycle.ts:765`) from any other thrown error
 *  (treated as fatal — matches the `else` branch at `:824-827`). Not
 *  exported: this is purely internal control flow, not a capability callers
 *  need. */
class JoinReturnedNoPayloadError extends Error {}

export function createSessionConnectionController<
  TClient extends SessionConnectionClient,
  TSessionData extends SessionConnectionSessionData,
  TQueueEvent extends { __typename: string; sequence: number },
  TSessionEvent,
>(deps: SessionConnectionDeps<TClient, TSessionData, TQueueEvent, TSessionEvent>): SessionConnectionController {
  const scheduleTimer = deps.scheduleTimer ?? ((callback, delayMs) => setTimeout(callback, delayMs));
  const clearTimer = deps.clearTimer ?? ((handle) => clearTimeout(handle as Parameters<typeof clearTimeout>[0]));

  // `stopped` replaces `mountedRef` + `connectionGenerationRef` (see module
  // doc comment). Starts `true` so any call made before `start()` is a
  // no-op, matching a controller that was created but never started.
  let stopped = true;
  let connecting = false; // isConnectingRef
  let reconnecting = false; // isReconnectingRef
  let transientRetryCount = 0;
  let subscriptionRetryCount = 0;
  let retryConnectTimer: SessionConnectionTimerHandle | null = null;
  let subscriptionRestartTimer: SessionConnectionTimerHandle | null = null;
  let currentClient: TClient | null = null;
  let queueUnsubscribe: (() => void) | null = null;
  let sessionUnsubscribe: (() => void) | null = null;

  // Join-epoch bookkeeping layered on top of `createJoinSessionTracker`'s
  // own (sessionId, epoch) cache. `ensureJoined` deliberately resolves
  // `void` (see `ensure-joined.ts`) — mobile's callers read the join result
  // via their own side-effecting closures, and we do the same here via
  // `lastJoinResult`, guarded by `joinEpoch` so a join that resolves AFTER
  // it's been superseded (epoch bumped mid-flight) never clobbers a newer
  // join's result. This is the epoch-bump test scenario: "a stale join
  // promise from the old socket isn't reused."
  let joinEpoch = 0;
  let lastJoinResult: TSessionData | null = null;

  const joinTracker = createJoinSessionTracker({
    // `deps.join` is fully self-contained per controller instance (the
    // platform closure already knows sessionId/boardPath — see the type
    // doc comment on `join`), so the tracker's own boardPath threading is
    // unused; any non-null placeholder satisfies "can join" without a
    // second async round-trip.
    getBoardPath: async () => deps.sessionId,
    execute: async () => {
      const epochAtStart = joinEpoch;
      const client = currentClient;
      if (!client) {
        throw new Error('session-connection: join attempted with no active client');
      }
      const result = await deps.join(client);
      if (epochAtStart === joinEpoch) {
        lastJoinResult = result;
      }
      if (result === null) {
        // Ensures `createJoinSessionTracker`'s cache-clear-on-throw fires
        // (`ensure-joined.ts:84-90`), so the NEXT `ensureJoined` call at
        // this same epoch fires a fresh join instead of replaying this
        // failure from cache.
        throw new JoinReturnedNoPayloadError('join returned no payload');
      }
    },
  });

  function bumpJoinEpoch(): void {
    joinEpoch += 1;
    joinTracker.bumpEpoch();
  }

  function computeBackoffDelay(attempt: number): number {
    return Math.min(
      deps.retryPolicy.initialRetryDelayMs * Math.pow(deps.retryPolicy.backoffMultiplier, attempt - 1),
      deps.retryPolicy.maxRetryDelayMs,
    );
  }

  /** Mirrors `scheduleSubscriptionRecovery` (`use-session-lifecycle.ts:613-643`). */
  function scheduleSubscriptionRecovery(): void {
    if (stopped) return;
    if (subscriptionRestartTimer) return; // already scheduled — matches the original's no-op-if-pending guard

    subscriptionRetryCount++;
    if (subscriptionRetryCount > deps.retryPolicy.maxTransientRetries) {
      subscriptionRetryCount = 0;
      deps.onFatal('subscription-retries-exhausted');
      return;
    }

    const delay = computeBackoffDelay(subscriptionRetryCount);
    subscriptionRestartTimer = scheduleTimer(() => {
      subscriptionRestartTimer = null;
      if (stopped) return;
      void handleReconnect();
    }, delay);
  }

  /** Mirrors `startSubscriptions` (`use-session-lifecycle.ts:645-715`). */
  function startSubscriptions(client: TClient): void {
    if (stopped) return;

    if (!queueUnsubscribe) {
      queueUnsubscribe = deps.subscribeQueue(client, {
        next: (event) => {
          subscriptionRetryCount = 0;
          deps.onQueueEvent(event);
        },
        error: (err) => {
          queueUnsubscribe = null;
          deps.onError(err);
          scheduleSubscriptionRecovery();
        },
        complete: () => {
          queueUnsubscribe = null;
          scheduleSubscriptionRecovery();
        },
      });
    }

    if (!sessionUnsubscribe) {
      sessionUnsubscribe = deps.subscribeSession(client, {
        next: (event) => {
          subscriptionRetryCount = 0;
          deps.onSessionEvent(event);
        },
        // Deliberately no `deps.onError` here — matches the original
        // hook's asymmetry (see the `onError` doc comment above).
        error: () => {
          sessionUnsubscribe = null;
          scheduleSubscriptionRecovery();
        },
        complete: () => {
          sessionUnsubscribe = null;
          scheduleSubscriptionRecovery();
        },
      });
    }
  }

  /** Mirrors `connect()` (`use-session-lifecycle.ts:717-833`). */
  async function connect(): Promise<void> {
    if (stopped) return;
    if (connecting) return;
    connecting = true;
    deps.onConnectStart();

    let client: TClient;
    try {
      client = deps.createClient(() => {
        void handleReconnect();
      });
    } catch (err) {
      connecting = false;
      if (!stopped) {
        deps.onError(err);
        deps.onFatal('connect-failed');
      }
      return;
    }

    currentClient = client;

    // Defensive — see the "First stale check" note in the module doc
    // comment: unreachable in practice today (nothing yields between
    // `start()`/a prior `stop()` and here), kept because the original
    // guarded the equivalent point (`use-session-lifecycle.ts:745-749`).
    if (stopped) {
      void client.dispose();
      connecting = false;
      return;
    }

    try {
      let sessionData: TSessionData | null;
      try {
        await joinTracker.ensureJoined(deps.sessionId);
        sessionData = lastJoinResult;
      } catch {
        sessionData = null;
      }

      if (stopped) {
        void client.dispose();
        return;
      }

      if (sessionData === null) {
        throw new JoinReturnedNoPayloadError('JoinSession returned no payload');
      }

      // Reset BOTH counters on a successful join — not just after the next
      // incoming event. Otherwise a low-traffic session where every
      // reconnect succeeds but no event arrives before the next disconnect
      // accumulates strikes across cycles and silently force-clears the
      // session, even though every individual join was healthy. Mirrors
      // `use-session-lifecycle.ts:770-771`.
      transientRetryCount = 0;
      subscriptionRetryCount = 0;

      deps.onSessionData(client, sessionData);
      deps.applyFullSync(sessionData);
      startSubscriptions(client);
      connecting = false;
    } catch (err) {
      connecting = false;
      const isTransientJoinFailure = err instanceof JoinReturnedNoPayloadError;

      if (!stopped) {
        deps.onError(err);
        if (isTransientJoinFailure) {
          transientRetryCount++;
          if (transientRetryCount > deps.retryPolicy.maxTransientRetries) {
            transientRetryCount = 0;
            deps.onFatal('transient-retries-exhausted');
          } else {
            const delay = computeBackoffDelay(transientRetryCount);
            retryConnectTimer = scheduleTimer(() => {
              retryConnectTimer = null;
              if (!stopped && !connecting) {
                void connect();
              }
            }, delay);
          }
        } else {
          deps.onFatal('connect-failed');
        }
      }

      // Always dispose on failure, mounted or not — matches
      // `use-session-lifecycle.ts:829-831` (outside the mounted guard).
      void client.dispose();
    }
  }

  /** Mirrors `handleReconnect()` (`use-session-lifecycle.ts:492-599`). */
  async function handleReconnect(): Promise<void> {
    const clientForReconnect = currentClient;
    if (stopped || !clientForReconnect) return;
    if (reconnecting) return;
    reconnecting = true;

    try {
      bumpJoinEpoch();

      const lastSequence = deps.gate.getLastSequence();

      let sessionData: TSessionData | null;
      try {
        await joinTracker.ensureJoined(deps.sessionId);
        sessionData = lastJoinResult;
      } catch {
        sessionData = null;
      }

      if (sessionData === null || stopped) return;

      // Same reset as the initial connect's success path — see the comment
      // there. Mirrors `use-session-lifecycle.ts:519-520`.
      transientRetryCount = 0;
      subscriptionRetryCount = 0;

      const serverSequence = sessionData.queueState.sequence;
      const strategy = deps.gate.decideReconnectStrategy({
        lastSequence,
        serverSequence,
        serverStateHash: sessionData.queueState.stateHash,
        localStateHash: deps.getLocalStateHash(),
      });

      // The original's delta-replay branch also required a truthy
      // `sessionId` (falsy -> no resync at all, `use-session-lifecycle.ts:543`).
      // Dropped here: `deps.sessionId` is a non-empty `string` for this
      // controller's entire lifetime, so the check can never fail.
      if (strategy === 'delta-replay' && lastSequence !== null) {
        try {
          const replay = await deps.replayEvents(clientForReconnect, lastSequence);
          if (!replay) {
            throw new Error('eventsReplay payload missing');
          }
          if (replay.currentSequence < serverSequence) {
            throw new Error(
              `eventsReplay currentSequence ${replay.currentSequence} is behind joined sequence ${serverSequence}`,
            );
          }
          if (!hasContiguousReplayCoverage(replay.events, lastSequence, replay.currentSequence)) {
            throw new Error(
              `eventsReplay returned non-contiguous coverage from ${lastSequence} to ${replay.currentSequence}`,
            );
          }
          for (const event of replay.events) {
            deps.onQueueEvent(event);
          }
        } catch {
          // Any failure above (network error, missing payload, sequence
          // regression, non-contiguous coverage) falls back to full sync —
          // matches `use-session-lifecycle.ts:579-582`.
          deps.applyFullSync(sessionData);
        }
      } else if (strategy === 'full-sync') {
        deps.applyFullSync(sessionData);
      }
      // strategy === 'none': nothing to apply, matches `:586-591`.

      deps.onSessionData(clientForReconnect, sessionData);
      startSubscriptions(clientForReconnect);
    } finally {
      reconnecting = false;
    }
  }

  return {
    start() {
      stopped = false;
      void connect();
    },
    stop({ sendLeave }) {
      stopped = true;
      connecting = false;

      if (retryConnectTimer) {
        clearTimer(retryConnectTimer);
        retryConnectTimer = null;
      }
      if (subscriptionRestartTimer) {
        clearTimer(subscriptionRestartTimer);
        subscriptionRestartTimer = null;
      }

      queueUnsubscribe?.();
      queueUnsubscribe = null;
      sessionUnsubscribe?.();
      sessionUnsubscribe = null;

      const clientToCleanup = currentClient;
      currentClient = null;

      // Fire-and-forget, matching `use-session-lifecycle.ts:863-879` — the
      // effect cleanup function itself stays synchronous.
      if (clientToCleanup) {
        void Promise.resolve()
          .then(async () => {
            if (sendLeave) {
              try {
                await deps.leave(clientToCleanup);
              } catch {
                // Swallow — matches the original's best-effort LEAVE_SESSION.
              }
            }
            await clientToCleanup.dispose();
          })
          .catch(() => {
            // Swallow — the connection is being torn down regardless.
          });
      }
    },
    triggerResync() {
      void handleReconnect();
    },
  };
}
