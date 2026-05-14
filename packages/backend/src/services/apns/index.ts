/**
 * APNs Live Activity Push Notification Service
 *
 * Sends ActivityKit push notifications to update iOS Live Activity widgets
 * when queue state changes during climbing sessions.
 *
 * Uses @parse/node-apn for token-based APNs authentication.
 * Gracefully degrades when APNs env vars are not configured.
 */

import apn from '@parse/node-apn';
import { eq } from 'drizzle-orm';
import { activityPushTokens } from '@boardsesh/db/schema/app';
import { db } from '../../db/client';
import { redisClientManager } from '../../redis/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LiveActivityContentState {
  climbName: string;
  climbDifficulty: string;
  angle: number;
  currentIndex: number;
  totalClimbs: number;
  hasNext: boolean;
  hasPrevious: boolean;
  climbUuid: string;
}

interface DebouncedEntry {
  timeout: ReturnType<typeof setTimeout>;
  latestState: LiveActivityContentState;
  /** Index into DB_RETRY_DELAYS_MS for the next retry. */
  dbRetryAttempt: number;
}

// Exponential-ish backoff schedule for transient DB lookup failures.
// 3 retries with growing delays gives ~14 s of total wait before giving up,
// which is enough to ride out a brief connection-pool blip or Postgres
// failover without dropping the update.
const DB_RETRY_DELAYS_MS = [1_000, 3_000, 8_000];

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let provider: apn.Provider | null = null;
let bundleId: string = 'com.boardsesh.app';
let configured = false;

/** Returns true if APNs env vars were present and the provider initialized. */
export function isApnsConfigured(): boolean {
  return configured;
}

/** Debounce map: sessionId -> pending send state */
const pendingSends = new Map<string, DebouncedEntry>();

// 1 s debounce. Climb navigation needs to feel responsive on the lock screen;
// a 5 s window made tapping Next visibly laggy. 1 s still absorbs the most
// common burst (QueueItemAdded + CurrentClimbChanged emitted back-to-back when
// a climb is queued).
const DEBOUNCE_MS = 1_000;

const REDIS_PENDING_KEY_PREFIX = 'boardsesh:apns:pending:';
// TTL slightly longer than the debounce so a restart within the window can
// still recover the latest pending state on next startup.
const REDIS_PENDING_TTL_SEC = 30;

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

interface ApnsMetrics {
  tokensRegistered: number;
  tokensEvicted: number;
  tokensRebound: number;
  tokensCleanedUpStale: number;
  sendsAttempted: number;
  sendsSucceeded: number;
  sendsFailed: number;
  sendsCoalesced: number;
  heartbeatsSent: number;
  dbRetriesUsed: number;
  pendingRecovered: number;
}

const metrics: ApnsMetrics = {
  tokensRegistered: 0,
  tokensEvicted: 0,
  tokensRebound: 0,
  tokensCleanedUpStale: 0,
  sendsAttempted: 0,
  sendsSucceeded: 0,
  sendsFailed: 0,
  sendsCoalesced: 0,
  heartbeatsSent: 0,
  dbRetriesUsed: 0,
  pendingRecovered: 0,
};

export function getApnsMetrics(): Readonly<ApnsMetrics> & { configured: boolean; pendingSendsInFlight: number } {
  return {
    ...metrics,
    configured,
    pendingSendsInFlight: pendingSends.size,
  };
}

export function incrementApnsMetric(key: keyof ApnsMetrics, delta = 1): void {
  metrics[key] += delta;
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

/**
 * Initialize the APNs provider.
 * Call once at server startup. If required env vars are missing the module
 * becomes a silent no-op — every public function returns immediately.
 */
export function initializeApns(): void {
  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  const keyContentsBase64 = process.env.APNS_KEY_CONTENTS;
  const envBundleId = process.env.APNS_BUNDLE_ID;
  const production = process.env.APNS_PRODUCTION === 'true';

  if (!keyId || !teamId || !keyContentsBase64) {
    console.warn(
      '[APNs] Missing one or more required env vars (APNS_KEY_ID, APNS_TEAM_ID, APNS_KEY_CONTENTS). ' +
        'Live Activity push notifications are disabled.',
    );
    return;
  }

  if (envBundleId) {
    bundleId = envBundleId;
  }

  const keyContents = Buffer.from(keyContentsBase64, 'base64').toString('utf-8');

  provider = new apn.Provider({
    token: {
      key: keyContents,
      keyId,
      teamId,
    },
    production,
  });

  configured = true;
  console.log(`[APNs] Initialized (production=${String(production)}, bundleId=${bundleId})`);

  // Best-effort: recover any debounced sends that were pending in Redis when
  // the previous process exited (or that another instance enqueued but never
  // got to flush). Failures are logged and ignored — the next queue event or
  // the heartbeat loop will catch up.
  void recoverPendingSendsFromRedis();
}

/**
 * Shutdown the APNs provider. Call during graceful server shutdown.
 */
export async function shutdownApns(): Promise<void> {
  // Clear all pending debounce timers. The latest state is already persisted
  // in Redis (see sendLiveActivityUpdate), so recoverPendingSendsFromRedis on
  // the next process will pick them up.
  for (const [, entry] of pendingSends) {
    clearTimeout(entry.timeout);
  }
  pendingSends.clear();

  if (provider) {
    await provider.shutdown();
    provider = null;
    configured = false;
    console.log('[APNs] Provider shut down');
  }
}

// ---------------------------------------------------------------------------
// Redis-backed pending-send persistence
// ---------------------------------------------------------------------------

function redisPendingKey(sessionId: string): string {
  return `${REDIS_PENDING_KEY_PREFIX}${sessionId}`;
}

async function writePendingToRedis(sessionId: string, state: LiveActivityContentState): Promise<void> {
  if (!redisClientManager.isRedisConnected()) return;
  try {
    const { publisher } = redisClientManager.getClients();
    await publisher.set(redisPendingKey(sessionId), JSON.stringify(state), 'EX', REDIS_PENDING_TTL_SEC);
  } catch (error) {
    // Persistence is best-effort; in-memory pendingSends is still the source
    // of truth for the active process.
    console.warn(`[APNs] Failed to persist pending send for session ${sessionId} to Redis:`, error);
  }
}

async function deletePendingFromRedis(sessionId: string): Promise<void> {
  if (!redisClientManager.isRedisConnected()) return;
  try {
    const { publisher } = redisClientManager.getClients();
    await publisher.del(redisPendingKey(sessionId));
  } catch (error) {
    console.warn(`[APNs] Failed to delete persisted pending send for session ${sessionId} from Redis:`, error);
  }
}

async function recoverPendingSendsFromRedis(): Promise<void> {
  if (!redisClientManager.isRedisConnected()) return;
  try {
    const { publisher } = redisClientManager.getClients();
    // SCAN is cheap at this volume (one key per active session at most) and
    // avoids the latency-spike risk of KEYS.
    let cursor = '0';
    const recovered: { sessionId: string; state: LiveActivityContentState }[] = [];
    do {
      const [nextCursor, keys] = await publisher.scan(cursor, 'MATCH', `${REDIS_PENDING_KEY_PREFIX}*`, 'COUNT', 100);
      cursor = nextCursor;
      for (const key of keys) {
        // GETDEL is atomic so two recovering instances don't race on the same
        // pending send. Available since Redis 6.2.
        const value = await publisher.call('GETDEL', key);
        if (typeof value !== 'string') continue;
        const sessionId = key.slice(REDIS_PENDING_KEY_PREFIX.length);
        try {
          const state = JSON.parse(value) as LiveActivityContentState;
          recovered.push({ sessionId, state });
        } catch (parseError) {
          console.warn(`[APNs] Skipping malformed pending-send record for session ${sessionId}:`, parseError);
        }
      }
    } while (cursor !== '0');

    if (recovered.length === 0) return;

    console.info(`[APNs] Recovering ${String(recovered.length)} pending Live Activity send(s) from Redis`);
    for (const { sessionId, state } of recovered) {
      metrics.pendingRecovered++;
      sendLiveActivityUpdate(sessionId, state);
    }
  } catch (error) {
    console.warn('[APNs] Failed to recover pending sends from Redis:', error);
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Fetch all APNs device tokens for a given session from the database.
 */
async function getTokensForSession(sessionId: string): Promise<string[]> {
  const rows = await db
    .select({ token: activityPushTokens.token })
    .from(activityPushTokens)
    .where(eq(activityPushTokens.sessionId, sessionId));

  return rows.map((r) => r.token);
}

/**
 * Delete a single stale device token from the database.
 */
async function deleteStaleToken(token: string): Promise<void> {
  try {
    await db.delete(activityPushTokens).where(eq(activityPushTokens.token, token));
    metrics.tokensCleanedUpStale++;
    console.log(`[APNs] Deleted stale token ${token.slice(0, 8)}...`);
  } catch (error) {
    console.error('[APNs] Failed to delete stale token:', error);
  }
}

interface SendOptions {
  /** If set, used in the structured log line to indicate the trigger. */
  source?: 'event' | 'heartbeat' | 'registration';
}

/**
 * Build and send an APNs Live Activity notification to the given tokens.
 * Returns the number of successful sends.
 */
async function sendNotification(
  sessionId: string,
  tokens: string[],
  event: 'update' | 'end',
  contentState?: LiveActivityContentState,
  options: SendOptions = {},
): Promise<{ sent: number; failed: number; stale: number }> {
  if (!provider || tokens.length === 0) return { sent: 0, failed: 0, stale: 0 };

  metrics.sendsAttempted += tokens.length;

  const notification = new apn.Notification();
  notification.topic = `${bundleId}.push-type.liveactivity`;
  notification.pushType = 'liveactivity';
  notification.priority = 10;

  notification.aps = {
    timestamp: Math.floor(Date.now() / 1000),
    event,
  };

  if (contentState && event === 'update') {
    notification.aps['content-state'] = contentState;
  }

  // Expire update notifications after 5 minutes, end notifications after 1 minute
  notification.expiry = Math.floor(Date.now() / 1000) + (event === 'end' ? 60 : 300);

  const startedAt = Date.now();
  let stale = 0;

  try {
    const result = await provider.send(notification, tokens);
    const sent = result.sent.length;
    const failed = result.failed.length;
    metrics.sendsSucceeded += sent;
    metrics.sendsFailed += failed;

    if (failed > 0) {
      const staleTokenDeletions: Promise<void>[] = [];

      for (const failure of result.failed) {
        const reason = failure.response?.reason;
        const status = failure.status;

        if (status === 410 || reason === 'BadDeviceToken' || reason === 'Unregistered' || reason === 'ExpiredToken') {
          stale++;
          staleTokenDeletions.push(deleteStaleToken(failure.device));
        } else {
          console.error(
            `[APNs] Send failed for session ${sessionId}, token ${failure.device.slice(0, 8)}...: ` +
              `status=${String(status)} reason=${reason ?? 'unknown'}`,
          );
        }
      }

      if (staleTokenDeletions.length > 0) {
        await Promise.all(staleTokenDeletions);
      }
    }

    console.info(
      `[APNs] session=${sessionId} event=${event} source=${options.source ?? 'event'} ` +
        `tokens=${String(tokens.length)} sent=${String(sent)} failed=${String(failed)} stale=${String(stale)} ` +
        `elapsedMs=${String(Date.now() - startedAt)}`,
    );

    return { sent, failed, stale };
  } catch (error) {
    metrics.sendsFailed += tokens.length;
    console.error(`[APNs] Send error for session ${sessionId}:`, error);
    return { sent: 0, failed: tokens.length, stale: 0 };
  }
}

/**
 * Execute debounced send: looks up tokens and delivers the notification.
 *
 * On transient DB failure, re-arms the debounce timer with an exponential
 * backoff schedule (1s, 3s, 8s). The pendingSends entry is preserved across
 * the retry so the latest coalesced state is still sent when the DB recovers.
 */
async function executeDebouncedSend(sessionId: string): Promise<void> {
  const entry = pendingSends.get(sessionId);
  if (!entry) return;

  let tokens: string[];
  try {
    tokens = await getTokensForSession(sessionId);
  } catch (error) {
    if (entry.dbRetryAttempt < DB_RETRY_DELAYS_MS.length) {
      const delay = DB_RETRY_DELAYS_MS[entry.dbRetryAttempt];
      console.error(
        `[APNs] getTokensForSession failed for session ${sessionId} ` +
          `(retry ${String(entry.dbRetryAttempt + 1)}/${String(DB_RETRY_DELAYS_MS.length)} in ${String(delay)}ms):`,
        error,
      );
      entry.dbRetryAttempt++;
      metrics.dbRetriesUsed++;
      entry.timeout = setTimeout(() => {
        executeDebouncedSend(sessionId).catch((retryError) => {
          console.error(`[APNs] Retried debounced send failed for session ${sessionId}:`, retryError);
        });
      }, delay);
      return;
    }
    console.error(
      `[APNs] Giving up on session ${sessionId} after ${String(DB_RETRY_DELAYS_MS.length)} DB retry(ies):`,
      error,
    );
    pendingSends.delete(sessionId);
    void deletePendingFromRedis(sessionId);
    return;
  }

  // Successful lookup — clear the entry and send.
  pendingSends.delete(sessionId);
  void deletePendingFromRedis(sessionId);
  if (tokens.length === 0) {
    console.info(`[APNs] No registered Live Activity tokens for session ${sessionId}; skipping update`);
    return;
  }

  await sendNotification(sessionId, tokens, 'update', entry.latestState);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Send a debounced Live Activity update for a session.
 *
 * If called multiple times within the debounce window, only the latest state
 * is sent. This respects APNs rate limits for Live Activity updates while
 * still feeling responsive for back-to-back queue mutations.
 */
export function sendLiveActivityUpdate(sessionId: string, contentState: LiveActivityContentState): void {
  if (!configured) return;

  // Persist the latest state to Redis so a restart inside the debounce window
  // can recover it. Failure to persist is non-fatal.
  void writePendingToRedis(sessionId, contentState);

  const existing = pendingSends.get(sessionId);

  if (existing) {
    // Replace the pending state but keep the existing timer
    existing.latestState = contentState;
    metrics.sendsCoalesced++;
    return;
  }

  // Schedule a new send after the debounce window
  const timeout = setTimeout(() => {
    executeDebouncedSend(sessionId).catch((error) => {
      console.error(`[APNs] Debounced send failed for session ${sessionId}:`, error);
    });
  }, DEBOUNCE_MS);

  pendingSends.set(sessionId, { timeout, latestState: contentState, dbRetryAttempt: 0 });
}

/**
 * Send an immediate Live Activity update to a specific set of tokens,
 * bypassing the per-session debounce. Used right after a device registers a
 * push token so the lock-screen widget exits "Loading…" without waiting for
 * the next organic queue event.
 *
 * Failures are logged but never thrown — this is a best-effort optimisation,
 * not a correctness guarantee.
 */
export async function sendLiveActivityUpdateToTokens(
  sessionId: string,
  tokens: string[],
  contentState: LiveActivityContentState,
  options: { source?: 'registration' | 'heartbeat' } = {},
): Promise<void> {
  if (!configured) return;
  if (tokens.length === 0) return;
  await sendNotification(sessionId, tokens, 'update', contentState, { source: options.source ?? 'registration' });
}

/**
 * End all Live Activities for a session.
 * Sends an "end" event to dismiss the activity on all devices and
 * cleans up tokens from the database.
 */
export async function endLiveActivity(sessionId: string): Promise<void> {
  if (!configured) return;

  // Cancel any pending debounced update
  const pending = pendingSends.get(sessionId);
  if (pending) {
    clearTimeout(pending.timeout);
    pendingSends.delete(sessionId);
  }
  void deletePendingFromRedis(sessionId);

  // Best-effort lookup — log and continue if the DB is unavailable.
  let tokens: string[] = [];
  try {
    tokens = await getTokensForSession(sessionId);
  } catch (error) {
    console.error(`[APNs] endLiveActivity: token lookup failed for session ${sessionId}:`, error);
  }

  if (tokens.length > 0) {
    await sendNotification(sessionId, tokens, 'end');
  } else {
    console.info(`[APNs] No registered Live Activity tokens for session ${sessionId}; skipping end`);
  }

  // Clean up tokens after ending (already wrapped in try/catch internally)
  await cleanupTokensForSession(sessionId);
}

/**
 * Delete all APNs device tokens for a session from the database.
 */
export async function cleanupTokensForSession(sessionId: string): Promise<void> {
  try {
    await db.delete(activityPushTokens).where(eq(activityPushTokens.sessionId, sessionId));
    console.log(`[APNs] Cleaned up tokens for session ${sessionId}`);
  } catch (error) {
    console.error(`[APNs] Failed to clean up tokens for session ${sessionId}:`, error);
  }
}

/** Test-only utility for clearing pendingSends between tests. */
export function __resetApnsPendingForTests(): void {
  for (const [, entry] of pendingSends) {
    clearTimeout(entry.timeout);
  }
  pendingSends.clear();
}
