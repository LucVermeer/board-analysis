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
// cached join from the dead connection is never reused. Two bump sites
// enforce that invariant:
//   1. `connect()` bumps right after creating a client — a new client IS a
//      new connection, so nothing cached against a previous client (e.g. a
//      join that succeeded on the old connection) can be served on this
//      one. Without this, a transient-retry's fresh client could hit the
//      tracker cache and never send JOIN_SESSION over its own connection —
//      every subsequent mutation would trip the server's `requireSession`
//      guard until the next reconnect.
//   2. `handleReconnect()` bumps at its top — web has no direct socket
//      'closed' event to hook (see `createClient` below); the earliest
//      point web can act is `onReconnect`, fired once graphql-ws has
//      already re-established the new connection. This is the equivalent
//      of mobile's 'closed'-handler bump.
// Every `ensureJoined` await captures the epoch beforehand and, on resume,
// abandons SILENTLY (no error, no retry strike, no dispose) when the epoch
// has moved — whatever resolved belongs to a superseded connection, and
// the newer owner (reconnect or retry) is already running its own join.
// This restores the old `connectionGenerationRef` discipline for the one
// async hop the `stopped` flag can't cover: the controller is still live,
// just on a newer connection generation.

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
 *  Platform session types (web's `Session`) satisfy this structurally.
 *
 *  `queueState` is nullable to match the schema (web's `Session.queueState`
 *  is `QueueState | null` — the server returns null on the `session` query's
 *  non-member preview and on `createSession`'s HTTP path). `joinSession` (a
 *  WS member payload) always returns a full snapshot, so a null here means a
 *  malformed response; the reconnect path treats it like a failed rejoin
 *  (see `handleReconnect`), and the initial-connect path leaves the decision
 *  to the platform's `applyFullSync` (web's port no-ops on null). */
export type SessionConnectionSessionData = {
  queueState: {
    sequence: number;
    stateHash: string;
    /** Order-sensitive (v2) hash — optional during the dual-hash rollout. Fed
     *  into `gate.decideReconnectStrategy` so a pure reorder drift (same
     *  members/sequence, equal v1 hash) full-syncs and recovers. Null when the
     *  server predates the rollout. */
    stateHashOrdered?: string | null;
  } | null;
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

/** Recovery paths the controller handles itself (no `onError`) but that the
 *  original hook still logged. `delta-sync-fallback` = the EVENTS_REPLAY
 *  path failed and the controller applied a full sync instead
 *  (`use-session-lifecycle.ts:580`, pre-W4); `session-subscription-error` =
 *  the session-updates subscription errored and recovery was scheduled
 *  (`:703`); `rejoin-missing-queue-state` = a rejoin resolved without a
 *  queue snapshot and was treated as a failed rejoin (the base hook's B3
 *  `rejoinedQueueState` guard — `error` is null for this kind, matching the
 *  base's message-only `console.error`). Surfaced via the optional
 *  `onRecoveryEvent` port so the controller stays console-free. */
export type SessionConnectionRecoveryEventKind =
  | 'delta-sync-fallback'
  | 'session-subscription-error'
  | 'rejoin-missing-queue-state';

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
  /** Synchronous local order-sensitive (v2) queue-state hash, fed into
   *  `gate.decideReconnectStrategy` alongside `getLocalStateHash`. Optional
   *  during the dual-hash rollout — when omitted (or it returns null) the gate
   *  falls back to the v1 comparison. Web supplies
   *  `computeQueueStateHashOrdered(queueRef.current, currentClimbQueueItemRef.current?.uuid || null)`. */
  getLocalStateHashOrdered?: () => string | null;
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
  /** Optional observability hook for the recovery paths the controller
   *  swallows itself (see `SessionConnectionRecoveryEventKind`). Web's
   *  implementation reproduces the pre-W4 hook's exact console calls. */
  onRecoveryEvent?: (kind: SessionConnectionRecoveryEventKind, error: unknown) => void;
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
          // A late error after stop() (e.g. the unsubscribe itself, or the
          // socket closing during teardown) must not surface through the
          // ports — the original gated the setError on mountedRef
          // (`use-session-lifecycle.ts:663`).
          if (stopped) return;
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
        error: (err) => {
          sessionUnsubscribe = null;
          // Same post-stop guard as the queue sink above.
          if (stopped) return;
          deps.onRecoveryEvent?.('session-subscription-error', err);
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
    // A new client IS a new underlying connection: bump the join epoch so
    // nothing cached against a previous client can be served on this one
    // (bump site 1 in the module doc comment's join-epoch mapping).
    bumpJoinEpoch();

    // Defensive: nothing yields between `start()` (or a prior `stop()`) and
    // here, so this is unreachable today. Kept because the original hook
    // guarded the equivalent point (`use-session-lifecycle.ts:745-749`).
    if (stopped) {
      void client.dispose();
      connecting = false;
      return;
    }

    try {
      const epochAtCall = joinEpoch;
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

      // Superseded mid-join: a reconnect bumped the epoch while this join
      // was in flight (the socket bounced — graphql-ws re-executes pending
      // operations on the new socket, so the STALE join commonly resolves
      // FIRST). Whatever resolved — success or failure — belongs to the
      // stale epoch; `handleReconnect` owns the connection now and is
      // running its own join. Abandon SILENTLY: no error (a healthy join
      // must not be misclassified as a no-payload failure), no retry
      // strike, and critically no dispose — the client is shared with the
      // in-flight reconnect that superseded us.
      if (joinEpoch !== epochAtCall) {
        connecting = false;
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
      // Drop the reference so nothing (a `triggerResync()` during the retry
      // window, a spurious late `onReconnect` from the disposed client) can
      // start a rejoin against the dead client — `handleReconnect` bails on
      // a null `currentClient`. Guarded: any superseded flow already
      // returned at the epoch check above, so `currentClient === client`
      // here unless `stop()` nulled it first.
      if (currentClient === client) {
        currentClient = null;
      }
    }
  }

  /** Mirrors `handleReconnect()` (`use-session-lifecycle.ts:492-599`). */
  async function handleReconnect(): Promise<void> {
    const clientForReconnect = currentClient;
    if (stopped || !clientForReconnect) return;
    if (reconnecting) return;
    reconnecting = true;

    try {
      // Bump site 2 (module doc comment): the connection was replaced under
      // us, so any join cached against the previous connection is stale.
      bumpJoinEpoch();
      const epochAtCall = joinEpoch;

      const lastSequence = deps.gate.getLastSequence();

      let sessionData: TSessionData | null;
      try {
        await joinTracker.ensureJoined(deps.sessionId);
        sessionData = lastJoinResult;
      } catch {
        sessionData = null;
      }

      if (stopped) return;
      // Superseded mid-rejoin: a newer connect() (transient retry) replaced
      // the client — and bumped the epoch — while this join was in flight.
      // That connect flow owns the session now; abandon silently. The
      // client identity check is belt-and-braces on top of the epoch: both
      // change together on client replacement, but only the client check
      // guarantees we never hand a replaced (disposed) client to
      // `onSessionData`/`startSubscriptions` below.
      if (joinEpoch !== epochAtCall || currentClient !== clientForReconnect) return;
      if (sessionData === null) return;

      // joinSession (a WS member payload) always returns a full queue
      // snapshot — the schema field is nullable only for the `session`
      // query's non-member preview and createSession's HTTP path, which
      // never flow through here. Without a snapshot there is no sequence or
      // hash to reconcile against, so treat it like a failed rejoin (silent
      // return; subscription recovery retries) instead of guessing. Ported
      // from the base hook's B3 `rejoinedQueueState` guard.
      const rejoinedQueueState = sessionData.queueState;
      if (!rejoinedQueueState) {
        deps.onRecoveryEvent?.('rejoin-missing-queue-state', null);
        return;
      }

      // Same reset as the initial connect's success path — see the comment
      // there. Mirrors `use-session-lifecycle.ts:519-520`.
      transientRetryCount = 0;
      subscriptionRetryCount = 0;

      const serverSequence = rejoinedQueueState.sequence;
      const strategy = deps.gate.decideReconnectStrategy({
        lastSequence,
        serverSequence,
        serverStateHash: rejoinedQueueState.stateHash,
        localStateHash: deps.getLocalStateHash(),
        // Order-sensitive hashes so a pure reorder drift (same members/sequence,
        // equal v1 hash) full-syncs and recovers instead of returning 'none'.
        // Both null when either side predates the rollout → gate falls back to v1.
        serverStateHashOrdered: rejoinedQueueState.stateHashOrdered ?? null,
        localStateHashOrdered: deps.getLocalStateHashOrdered?.() ?? null,
      });

      // The original's delta-replay branch also required a truthy
      // `sessionId` (falsy -> no resync at all, `use-session-lifecycle.ts:543`).
      // Dropped here: `deps.sessionId` is a non-empty `string` for this
      // controller's entire lifetime, so the check can never fail.
      if (strategy === 'delta-replay' && lastSequence !== null) {
        try {
          const replay = await deps.replayEvents(clientForReconnect, lastSequence);
          // stop() while the replay was in flight: the hook has already
          // reset the sync gate and disposed the client — re-dispatching
          // this session's events after teardown would leak them into a
          // successor session on an A->B switch. Bail before any port
          // callback fires.
          if (stopped) return;
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
        } catch (err) {
          // Same teardown guard as the success path — a replay that REJECTS
          // after stop() must not apply a post-teardown full sync either.
          if (stopped) return;
          deps.onRecoveryEvent?.('delta-sync-fallback', err);
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
