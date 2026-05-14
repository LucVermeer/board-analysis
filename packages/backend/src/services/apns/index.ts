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
  /** Number of times we've retried after a transient DB error. Capped at 1. */
  dbRetryCount: number;
}

const MAX_DB_RETRIES = 1;
const DB_RETRY_DELAY_MS = 2_000;

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

const DEBOUNCE_MS = 5_000;

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
}

/**
 * Shutdown the APNs provider. Call during graceful server shutdown.
 */
export async function shutdownApns(): Promise<void> {
  // Clear all pending debounce timers
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
    console.log(`[APNs] Deleted stale token ${token.slice(0, 8)}...`);
  } catch (error) {
    console.error('[APNs] Failed to delete stale token:', error);
  }
}

/**
 * Build and send an APNs Live Activity notification to the given tokens.
 */
async function sendNotification(
  sessionId: string,
  tokens: string[],
  event: 'update' | 'end',
  contentState?: LiveActivityContentState,
): Promise<void> {
  if (!provider || tokens.length === 0) return;

  console.log(`[APNs] Sending Live Activity ${event} for session ${sessionId} to ${String(tokens.length)} device(s)`);

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

  try {
    const result = await provider.send(notification, tokens);
    console.log(
      `[APNs] Results for session ${sessionId}: ${String(result.sent.length)} sent, ` +
        `${String(result.failed.length)} failed`,
    );

    if (result.failed.length > 0) {
      // Handle stale tokens (410 Gone / BadDeviceToken / Unregistered)
      const staleTokenDeletions: Promise<void>[] = [];

      for (const failure of result.failed) {
        const reason = failure.response?.reason;
        const status = failure.status;

        if (status === 410 || reason === 'BadDeviceToken' || reason === 'Unregistered' || reason === 'ExpiredToken') {
          console.log(
            `[APNs] Stale token for session ${sessionId} (${reason ?? `status ${String(status)}`}): ` +
              `${failure.device.slice(0, 8)}...`,
          );
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
  } catch (error) {
    console.error('[APNs] Send error:', error);
  }
}

/**
 * Execute debounced send: looks up tokens and delivers the notification.
 *
 * If the DB lookup fails (transient connection error, timeout) and we
 * haven't already retried, re-arm the debounce timer once after a short
 * delay rather than silently dropping the update. The cap of MAX_DB_RETRIES
 * prevents unbounded loops if the DB is genuinely down.
 */
async function executeDebouncedSend(sessionId: string): Promise<void> {
  const entry = pendingSends.get(sessionId);
  if (!entry) return;

  let tokens: string[];
  try {
    tokens = await getTokensForSession(sessionId);
  } catch (error) {
    if (entry.dbRetryCount < MAX_DB_RETRIES) {
      console.error(
        `[APNs] getTokensForSession failed for session ${sessionId} (retry ${String(entry.dbRetryCount + 1)}/${String(MAX_DB_RETRIES)}):`,
        error,
      );
      entry.dbRetryCount++;
      entry.timeout = setTimeout(() => {
        executeDebouncedSend(sessionId).catch((retryError) => {
          console.error(`[APNs] Retried debounced send failed for session ${sessionId}:`, retryError);
        });
      }, DB_RETRY_DELAY_MS);
      return;
    }
    console.error(`[APNs] Giving up on session ${sessionId} after ${String(MAX_DB_RETRIES)} DB retry(ies):`, error);
    pendingSends.delete(sessionId);
    return;
  }

  // Successful lookup — clear the entry and send.
  pendingSends.delete(sessionId);
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
 * If called multiple times within the debounce window (5 s), only the
 * latest state is sent. This respects APNs rate limits for Live Activity
 * updates (roughly 1 per second sustained, with budgets).
 */
export function sendLiveActivityUpdate(sessionId: string, contentState: LiveActivityContentState): void {
  if (!configured) return;

  const existing = pendingSends.get(sessionId);

  if (existing) {
    // Replace the pending state but keep the existing timer
    existing.latestState = contentState;
    console.info(`[APNs] Coalesced Live Activity update for session ${sessionId} into pending debounce`);
    return;
  }

  console.info(`[APNs] Queued Live Activity update for session ${sessionId}; waiting for debounce`);

  // Schedule a new send after the debounce window
  const timeout = setTimeout(() => {
    executeDebouncedSend(sessionId).catch((error) => {
      console.error(`[APNs] Debounced send failed for session ${sessionId}:`, error);
    });
  }, DEBOUNCE_MS);

  pendingSends.set(sessionId, { timeout, latestState: contentState, dbRetryCount: 0 });
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
