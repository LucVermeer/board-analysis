/**
 * Per-USER token bucket for the session read poll (`GET /api/session/state`).
 *
 * The watch polls this endpoint every ~3s while foregrounded, so the limit is
 * deliberately generous: capacity 4, refill 1 token/sec. A legitimate 3s poll
 * (0.33/sec) never trips it; a buggy/malicious client hammering the endpoint is
 * throttled to ~1 read/sec, bounding the `getQueueState` (Redis) +
 * `verifyWidgetSession` (Postgres) load a single account can generate.
 *
 * Keyed by userId, NOT sessionId: a read is a personal poll, and a per-user
 * bucket means one account's spamming can't throttle another participant's
 * polling of the same session. This is a SEPARATE bucket from the write limiter
 * (`checkWidgetRateLimit`) so read spam can't drain the navigation bucket.
 *
 * In-memory / per-instance — defense-in-depth, not a hard quota (same posture as
 * the widget write limiter).
 */
const READ_BUCKET_CAPACITY = 4;
const READ_REFILL_PER_SECOND = 1;

interface RateBucket {
  tokens: number;
  lastRefillMs: number;
}

const readBuckets = new Map<string, RateBucket>();

/** Returns true when a token was available (request allowed), false to 429. */
export function checkSessionReadRateLimit(userId: string): boolean {
  const now = Date.now();
  const existing = readBuckets.get(userId);

  if (!existing) {
    readBuckets.set(userId, { tokens: READ_BUCKET_CAPACITY - 1, lastRefillMs: now });
    return true;
  }

  const elapsedSeconds = (now - existing.lastRefillMs) / 1000;
  const refilled = Math.min(READ_BUCKET_CAPACITY, existing.tokens + elapsedSeconds * READ_REFILL_PER_SECOND);
  existing.lastRefillMs = now;

  if (refilled < 1) {
    existing.tokens = refilled;
    return false;
  }

  existing.tokens = refilled - 1;
  return true;
}

const READ_BUCKET_PRUNE_INTERVAL_MS = 5 * 60 * 1000;
const READ_BUCKET_TTL_MS = 5 * 60 * 1000;
let pruneIntervalHandle: ReturnType<typeof setInterval> | null = null;

export function ensureSessionReadRateLimitPruner(): void {
  if (pruneIntervalHandle !== null) return;
  pruneIntervalHandle = setInterval(() => {
    const cutoff = Date.now() - READ_BUCKET_TTL_MS;
    for (const [userId, bucket] of readBuckets) {
      if (bucket.lastRefillMs < cutoff) {
        readBuckets.delete(userId);
      }
    }
  }, READ_BUCKET_PRUNE_INTERVAL_MS);
  if (typeof pruneIntervalHandle.unref === 'function') pruneIntervalHandle.unref();
}

/** Reset all buckets and stop the pruner. Test-only. */
export function __resetSessionReadRateLimitForTests(): void {
  readBuckets.clear();
  if (pruneIntervalHandle !== null) {
    clearInterval(pruneIntervalHandle);
    pruneIntervalHandle = null;
  }
}
