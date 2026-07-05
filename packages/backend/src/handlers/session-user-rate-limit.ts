/**
 * Per-USER token bucket, applied at the FRONT (after auth, before the DB guard)
 * of the JWT-authed session endpoints — `GET /api/session/state` (a ~3s poll)
 * and the `/api/session/navigate` + `/api/session/take-control` writes.
 *
 * Deliberately generous: capacity 4, refill 1 token/sec. A legitimate 3s poll
 * (0.33/sec) plus the occasional button-press write never trips it; a
 * buggy/malicious authenticated client hammering any of these endpoints is
 * throttled to ~1/sec — which bounds the `verifyWidgetSession` (Postgres) +
 * `getQueueState` (Redis) load a single account can drive BEFORE the participant
 * guard runs. Without it, a non-participant who knows a sessionId 403s at the
 * guard on every request (never reaching the per-session write bucket) and could
 * otherwise spin the guard's queries unbounded.
 *
 * Keyed by userId, NOT sessionId: throttling is personal, so one account's
 * spamming can't affect another participant. This is a SEPARATE bucket from the
 * per-session write limiter (`checkWidgetRateLimit`) so it can't drain the
 * navigation bucket (and vice versa).
 *
 * In-memory / per-instance — defense-in-depth, not a hard quota (same posture as
 * the widget write limiter).
 */
const USER_BUCKET_CAPACITY = 4;
const USER_REFILL_PER_SECOND = 1;

interface RateBucket {
  tokens: number;
  lastRefillMs: number;
}

const userBuckets = new Map<string, RateBucket>();

/** Returns true when a token was available (request allowed), false to 429. */
export function checkSessionUserRateLimit(userId: string): boolean {
  const now = Date.now();
  const existing = userBuckets.get(userId);

  if (!existing) {
    userBuckets.set(userId, { tokens: USER_BUCKET_CAPACITY - 1, lastRefillMs: now });
    return true;
  }

  const elapsedSeconds = (now - existing.lastRefillMs) / 1000;
  const refilled = Math.min(USER_BUCKET_CAPACITY, existing.tokens + elapsedSeconds * USER_REFILL_PER_SECOND);
  existing.lastRefillMs = now;

  if (refilled < 1) {
    existing.tokens = refilled;
    return false;
  }

  existing.tokens = refilled - 1;
  return true;
}

const USER_BUCKET_PRUNE_INTERVAL_MS = 5 * 60 * 1000;
const USER_BUCKET_TTL_MS = 5 * 60 * 1000;
let pruneIntervalHandle: ReturnType<typeof setInterval> | null = null;

export function ensureSessionUserRateLimitPruner(): void {
  if (pruneIntervalHandle !== null) return;
  pruneIntervalHandle = setInterval(() => {
    const cutoff = Date.now() - USER_BUCKET_TTL_MS;
    for (const [userId, bucket] of userBuckets) {
      if (bucket.lastRefillMs < cutoff) {
        userBuckets.delete(userId);
      }
    }
  }, USER_BUCKET_PRUNE_INTERVAL_MS);
  if (typeof pruneIntervalHandle.unref === 'function') pruneIntervalHandle.unref();
}

/** Reset all buckets and stop the pruner. Test-only. */
export function __resetSessionUserRateLimitForTests(): void {
  userBuckets.clear();
  if (pruneIntervalHandle !== null) {
    clearInterval(pruneIntervalHandle);
    pruneIntervalHandle = null;
  }
}
