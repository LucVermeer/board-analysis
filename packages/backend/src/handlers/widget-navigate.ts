import type { IncomingMessage, ServerResponse } from 'http';
import { eq } from 'drizzle-orm';
import { activityPushTokens } from '@boardsesh/db/schema/app';
import { db } from '../db/client';
import { applyCorsHeaders } from './cors';
import { roomManager } from '../services/room-manager';
import { pubsub } from '../pubsub/index';
import { navigateToQueueItem } from '../services/queue-navigation';
import {
  trackLiveActivityWidgetNavigation,
  trackLiveActivityWidgetNavigationAttributionGap,
} from '../services/analytics/live-activity';
import { logger } from '../utils/logger';

interface WidgetNavigateBody {
  sessionId: string;
  action: 'next' | 'previous';
  currentIndex: number;
}

function isValidBody(body: unknown): body is WidgetNavigateBody {
  if (typeof body !== 'object' || body === null) return false;
  const candidate = body as Record<string, unknown>;
  if (typeof candidate.sessionId !== 'string' || candidate.sessionId.length === 0) return false;
  if (candidate.action !== 'next' && candidate.action !== 'previous') return false;
  if (
    typeof candidate.currentIndex !== 'number' ||
    !Number.isInteger(candidate.currentIndex) ||
    candidate.currentIndex < 0
  ) {
    return false;
  }
  return true;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalLength = 0;
    const MAX_BODY = 4096; // 4 KB is more than enough for this payload

    req.on('data', (chunk: Buffer) => {
      totalLength += chunk.length;
      if (totalLength > MAX_BODY) {
        req.destroy();
        reject(new Error('Request body too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/**
 * Per-session token bucket for widget navigation.
 *
 * Threat model: an iOS widget can fire navigate requests rapidly (e.g. user
 * mashing the next button while the lock screen renders). Without a limit,
 * `navigateToQueueItem`'s internal MAX_RETRIES=3 retry loop can amplify a
 * burst of widget taps into a stampede on `roomManager.updateQueueState`.
 *
 * Bucket: 2 capacity, refills at 1 token / 1.5s. So 2 quick taps go through;
 * sustained taps are limited to ~40 req/min per session.
 *
 * In-memory only — the widget endpoint runs per-instance and the limit is a
 * defense-in-depth measure, not a hard quota. Across instances the limit is
 * looser, which is acceptable for this threat model.
 */
const RATE_BUCKET_CAPACITY = 2;
const RATE_REFILL_PER_SECOND = 1 / 1.5;

interface RateBucket {
  tokens: number;
  lastRefillMs: number;
}

const rateBuckets = new Map<string, RateBucket>();

function checkRateLimit(sessionId: string): boolean {
  const now = Date.now();
  const existing = rateBuckets.get(sessionId);

  if (!existing) {
    rateBuckets.set(sessionId, { tokens: RATE_BUCKET_CAPACITY - 1, lastRefillMs: now });
    return true;
  }

  // Refill tokens based on elapsed time
  const elapsedSeconds = (now - existing.lastRefillMs) / 1000;
  const refilled = Math.min(RATE_BUCKET_CAPACITY, existing.tokens + elapsedSeconds * RATE_REFILL_PER_SECOND);
  existing.lastRefillMs = now;

  if (refilled < 1) {
    existing.tokens = refilled;
    return false;
  }

  existing.tokens = refilled - 1;
  return true;
}

/** Periodically prune buckets that haven't been touched for 5 minutes. */
const RATE_BUCKET_PRUNE_INTERVAL_MS = 5 * 60 * 1000;
const RATE_BUCKET_TTL_MS = 5 * 60 * 1000;
let pruneIntervalHandle: ReturnType<typeof setInterval> | null = null;

function ensurePrunerRunning(): void {
  if (pruneIntervalHandle !== null) return;
  pruneIntervalHandle = setInterval(() => {
    const cutoff = Date.now() - RATE_BUCKET_TTL_MS;
    for (const [sessionId, bucket] of rateBuckets) {
      if (bucket.lastRefillMs < cutoff) {
        rateBuckets.delete(sessionId);
      }
    }
  }, RATE_BUCKET_PRUNE_INTERVAL_MS);
  // Don't keep the process alive solely for this timer.
  if (typeof pruneIntervalHandle.unref === 'function') pruneIntervalHandle.unref();
}

type AuthResult =
  | { kind: 'ok'; userId: string | null }
  | { kind: 'missing' } // No bearer at all → 401
  | { kind: 'unknown' } // Bearer present but no row matches the token → 401
  | { kind: 'wrong-session'; boundSessionId: string; userId: string | null }; // Token exists but bound to a different session → 410

type WidgetNavigationAnalyticsEvent = Parameters<typeof trackLiveActivityWidgetNavigation>[0];
type WidgetNavigationAnalyticsPayload = Omit<WidgetNavigationAnalyticsEvent, 'userId'>;

function trackWidgetNavigation(userId: string | null, event: WidgetNavigationAnalyticsPayload): void {
  if (userId) {
    trackLiveActivityWidgetNavigation({ userId, ...event });
    return;
  }

  trackLiveActivityWidgetNavigationAttributionGap({
    ...event,
    reason: 'missing_user_id',
  });
}

/**
 * Verify that the bearer token in the Authorization header is registered to
 * `sessionId` in `activity_push_tokens`. This is the auth contract the iOS
 * widget honors: the widget reads its APNs Live Activity push token (already
 * registered via `registerActivityPushToken`) and sends it as a Bearer header.
 *
 * Distinguishes "token unknown" (genuinely bogus → 401) from "token bound to
 * a different session" (need to re-register → 410). iOS uses the 410 hint to
 * fire a fresh `registerActivityPushToken` mutation.
 */
async function authenticateWidget(authHeader: string | undefined, sessionId: string): Promise<AuthResult> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return { kind: 'missing' };
  const bearer = authHeader.slice(7).trim();
  if (!bearer) return { kind: 'missing' };

  const rows = await db
    .select({ sessionId: activityPushTokens.sessionId, userId: activityPushTokens.userId })
    .from(activityPushTokens)
    .where(eq(activityPushTokens.token, bearer))
    .limit(1);

  if (rows.length === 0) return { kind: 'unknown' };
  const boundSessionId = rows[0].sessionId;
  const userId = rows[0].userId ?? null;
  if (boundSessionId !== sessionId) return { kind: 'wrong-session', boundSessionId, userId };
  return { kind: 'ok', userId };
}

/**
 * Handle widget navigation requests.
 *
 * POST /api/widget/navigate
 * Headers:
 *   Authorization: Bearer <apnsToken>  -- the registered APNs Live Activity
 *                                         push token for the session.
 * Body: { sessionId: string, action: "next" | "previous", currentIndex: number }
 *
 * This is a lightweight REST endpoint called by the iOS lock-screen widget
 * when the main app is suspended. Authentication is enforced via the
 * registered ActivityKit push token: a row must exist in
 * `activity_push_tokens` with `(token = bearer, sessionId = body.sessionId)`.
 * The token is itself only known to the device that registered it (via the
 * authenticated `registerActivityPushToken` GraphQL mutation), so possession
 * proves the device is a participant in the session.
 *
 * Per-session rate limit (token bucket, capacity 2, refill 1 / 1.5s) returns
 * 429 to absorb widget-button mashes.
 */
export async function handleWidgetNavigate(req: IncomingMessage, res: ServerResponse): Promise<void> {
  ensurePrunerRunning();

  // CORS headers (allow the widget's URLSession to call this).
  // applyCorsHeaders already replies 200 for OPTIONS preflight and returns
  // false, so we short-circuit on that path.
  if (!applyCorsHeaders(req, res)) return;

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'Method not allowed' }));
    return;
  }

  let body: unknown;
  try {
    const raw = await readBody(req);
    body = JSON.parse(raw);
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'Invalid JSON body' }));
    return;
  }

  if (!isValidBody(body)) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        success: false,
        error: 'Body must include sessionId (string), action ("next" | "previous"), and currentIndex (integer)',
      }),
    );
    return;
  }

  const { sessionId, action, currentIndex: _ignoredClientIndex } = body;

  // Auth: bearer token must be registered to this sessionId
  const authHeader = req.headers['authorization'];
  const authHeaderValue = Array.isArray(authHeader) ? authHeader[0] : authHeader;

  let authResult: AuthResult;
  try {
    authResult = await authenticateWidget(authHeaderValue, sessionId);
  } catch (error) {
    logger.error('[WidgetNavigate] Auth lookup failed:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'Auth error' }));
    return;
  }

  if (authResult.kind !== 'ok') {
    if (authResult.kind === 'wrong-session') {
      // Token is known but bound to a different session. Returning 410 Gone
      // signals the widget to clear its cached push token and trigger a
      // re-registration via the main app.
      logger.info(
        `[WidgetNavigate] Token bound to session ${authResult.boundSessionId}, request was for ${sessionId}; signaling re-register`,
      );
      trackWidgetNavigation(authResult.userId, {
        sessionId,
        action,
        outcome: 'wrong_session',
        statusCode: 410,
        boundSessionId: authResult.boundSessionId,
      });
      res.writeHead(410, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Token bound to a different session; re-register' }));
      return;
    }
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'Unauthorized' }));
    return;
  }

  // Rate limit (per session) — apply *after* auth so unauth requests can't poison the bucket
  if (!checkRateLimit(sessionId)) {
    trackWidgetNavigation(authResult.userId, {
      sessionId,
      action,
      outcome: 'rate_limited',
      statusCode: 429,
    });
    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'Too many requests' }));
    return;
  }

  try {
    // Determine target index based on action and current queue state
    const queueState = await roomManager.getQueueState(sessionId);
    const queueLength = queueState.queue.length;

    if (queueLength === 0) {
      // Return 4xx so the widget's status-code check fires its Darwin-notification
      // fallback and the user sees a real error path rather than a silent no-op.
      trackWidgetNavigation(authResult.userId, {
        sessionId,
        action,
        outcome: 'queue_empty',
        statusCode: 409,
        queueLength,
      });
      res.writeHead(409, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Queue is empty' }));
      return;
    }

    // Use the server's authoritative current index, not the client-supplied
    // one which may be stale (e.g., another user changed the climb while
    // the widget's local state was out of date).
    const currentItem = queueState.currentClimbQueueItem;
    const serverCurrentIndex = currentItem ? queueState.queue.findIndex((q) => q.uuid === currentItem.uuid) : 0;
    const baseIndex = serverCurrentIndex >= 0 ? serverCurrentIndex : 0;

    let targetIndex: number;
    if (action === 'next') {
      targetIndex = baseIndex + 1;
      if (targetIndex >= queueLength) {
        targetIndex = 0;
      }
    } else {
      targetIndex = baseIndex - 1;
      if (targetIndex < 0) {
        targetIndex = queueLength - 1;
      }
    }

    const result = await navigateToQueueItem(
      sessionId,
      targetIndex,
      roomManager,
      pubsub,
      undefined, // no clientId for widget
      'widget-navigate',
    );

    if (result) {
      trackWidgetNavigation(authResult.userId, {
        sessionId,
        action,
        outcome: 'success',
        statusCode: 200,
        queueLength,
        serverCurrentIndex,
        targetIndex,
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, currentIndex: targetIndex }));
    } else {
      // Same reasoning as the queue-empty branch: 4xx surfaces the failure
      // to the widget's HTTP fallback path.
      trackWidgetNavigation(authResult.userId, {
        sessionId,
        action,
        outcome: 'target_out_of_bounds',
        statusCode: 409,
        queueLength,
        serverCurrentIndex,
        targetIndex,
      });
      res.writeHead(409, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Target index out of bounds' }));
    }
  } catch (error) {
    logger.error('[WidgetNavigate] Error:', error);
    trackWidgetNavigation(authResult.userId, {
      sessionId,
      action,
      outcome: 'error',
      statusCode: 500,
    });
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      }),
    );
  }
}

/**
 * Test-only utility to clear in-memory rate-limit state between tests.
 * Not exported via the public module API; tests import directly.
 */
export function __resetWidgetRateLimitForTests(): void {
  rateBuckets.clear();
  if (pruneIntervalHandle !== null) {
    clearInterval(pruneIntervalHandle);
    pruneIntervalHandle = null;
  }
}
