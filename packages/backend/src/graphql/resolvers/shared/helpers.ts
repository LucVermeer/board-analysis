import type { ConnectionContext } from '@boardsesh/shared-schema';
import { GraphQLError } from 'graphql';
import { checkRateLimit, RateLimitError } from '../../../utils/rate-limiter';
import { checkRateLimitRedis } from '../../../utils/redis-rate-limiter';
import { getContext } from '../../context';
import { getDistributedState } from '../../../services/distributed-state';
import { db } from '../../../db/client';
import { esp32Controllers, boardSessionParticipants } from '@boardsesh/db/schema/app';
import { and, eq } from 'drizzle-orm';
import { logger } from '../../../utils/logger';

// Re-export validateInput from validation schemas
export { validateInput } from '../../../validation/schemas';
// Re-export MAX_RETRIES from types
export { MAX_RETRIES } from './types';
export { isNoMatchClimb, isNoMatch } from '@boardsesh/shared-schema';

/**
 * Configuration for session membership retry behavior.
 *
 * With defaults (8 retries, 50ms initial delay):
 * - Delays: 50, 100, 200, 400, 800, 1600, 3200ms
 * - Total max wait: ~6.35 seconds
 *
 * GraphQL subscription timeout should exceed this value to avoid
 * subscription failures during high-latency join operations.
 */
export const SESSION_MEMBER_RETRY_CONFIG = {
  maxRetries: 8,
  initialDelayMs: 50,
} as const;

/**
 * Per-user rate-limit ceilings (requests/minute) for interactive party-session
 * traffic, on dedicated buckets separate from the shared `default` (60/min).
 *
 * Before #2763 every queue + wall-control mutation shared `default`, so a
 * two-person session exhausted it just by switching boulders (each swipe fans
 * out to ~2 mutations; the setCurrentClimb coalescer also fires addQueueItem
 * for superseded swipes) — every subsequent action then failed for up to 60s,
 * surfacing as "the connection fails every time we switch boulders".
 *
 * `RATE_LIMIT_SESSION` covers user-gesture-driven queue + wall-control
 * mutations; `RATE_LIMIT_PLAYBACK` isolates the per-frame publishPlaybackState
 * broadcast so a playing variable-speed climb can't starve climb switching.
 * Both are well above any human gesture rate (with fan-out) yet still cap a
 * runaway client. Playback allows up to 60 publishes/sec so route playback
 * sync can follow fast frame cadences without tripping the limiter. Mirrors
 * the existing per-operation buckets for
 * `confirmClimbOnWall` and `search-climbs`.
 */
export const RATE_LIMIT_SESSION_OP = 'session';
export const RATE_LIMIT_SESSION = 1200;
export const RATE_LIMIT_PLAYBACK_OP = 'playback';
export const RATE_LIMIT_PLAYBACK = 3600;
export const RATE_LIMIT_JOIN_SESSION_OP = 'joinSession';
export const RATE_LIMIT_JOIN_SESSION = 600;
export const RATE_LIMIT_CREATE_SESSION_OP = 'createSession';
export const RATE_LIMIT_CREATE_SESSION = 180;
export const RATE_LIMIT_END_SESSION_OP = 'endSession';
export const RATE_LIMIT_END_SESSION = 180;
export const RATE_LIMIT_CONFIRM_CLIMB_ON_WALL_OP = 'confirmClimbOnWall';
export const RATE_LIMIT_CONFIRM_CLIMB_ON_WALL = 600;
export const RATE_LIMIT_SET_QUEUE_OP = 'setQueue';
export const RATE_LIMIT_SET_QUEUE = 300;

/**
 * Helper to require a session context.
 * Throws if the user is not in a session.
 */
export function requireSession(ctx: ConnectionContext): string {
  if (!ctx.sessionId) {
    logger.warn('[Auth] requireSession failed', { connectionId: ctx.connectionId, sessionId: ctx.sessionId });
    throw new Error(`Must be in a session to perform this operation (connectionId: ${ctx.connectionId})`);
  }
  return ctx.sessionId;
}

/**
 * Helper to require authentication.
 * Throws if the user is not authenticated.
 * Used for operations that require a logged-in user (e.g., creating sessions).
 */
export function requireAuthenticated(ctx: ConnectionContext): void {
  if (!ctx.isAuthenticated) {
    throw new Error('Authentication required to perform this operation');
  }
}

/**
 * Helper to verify user is a member of the session they're trying to access.
 * Used for subscription authorization.
 *
 * This function includes retry logic with exponential backoff to handle race conditions
 * where subscriptions may be authorized before joinSession has completed updating the context.
 *
 * In multi-instance mode, it also checks distributed state for cross-instance validation.
 *
 * @see SESSION_MEMBER_RETRY_CONFIG for timing configuration details
 */
export async function requireSessionMember(
  ctx: ConnectionContext,
  sessionId: string,
  maxRetries = SESSION_MEMBER_RETRY_CONFIG.maxRetries,
  initialDelayMs = SESSION_MEMBER_RETRY_CONFIG.initialDelayMs,
): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    // First check local context (fast path for same-instance)
    const latestCtx = getContext(ctx.connectionId);
    if (latestCtx?.sessionId === sessionId) {
      return; // Success - session matches locally
    }

    // Check distributed state on each iteration
    // We re-fetch on each retry to handle cases where distributed state becomes available
    // after initial retries (e.g., Redis reconnection). The getDistributedState() call is
    // synchronous and cheap - it just returns a cached singleton reference.
    const distributedState = getDistributedState();
    if (distributedState) {
      const isInSession = await distributedState.isConnectionInSession(ctx.connectionId, sessionId);
      if (isInSession) {
        return; // Success - session matches in distributed state
      }
    }

    if (i < maxRetries - 1) {
      // Exponential backoff: 50ms, 100ms, 200ms, 400ms, 800ms, 1600ms, 3200ms
      // Total max wait: ~6.4 seconds
      const delay = initialDelayMs * Math.pow(2, i);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // Final check after all retries - check both local and distributed state
  const finalCtx = getContext(ctx.connectionId);

  // Check distributed state one more time
  const distributedState = getDistributedState();
  if (distributedState) {
    const isInSession = await distributedState.isConnectionInSession(ctx.connectionId, sessionId);
    if (isInSession) {
      return; // Success via distributed state
    }
  }

  if (!finalCtx?.sessionId) {
    logger.warn('[Auth] requireSessionMember failed after retries: not in any session', {
      connectionId: ctx.connectionId,
      requestedSessionId: sessionId,
      maxRetries,
    });
    throw new Error(`Unauthorized: not in any session (connectionId: ${ctx.connectionId}, requested: ${sessionId})`);
  }
  if (finalCtx.sessionId !== sessionId) {
    logger.warn('[Auth] requireSessionMember failed: session mismatch', {
      connectionId: ctx.connectionId,
      currentSessionId: finalCtx.sessionId,
      requestedSessionId: sessionId,
    });
    throw new Error(`Unauthorized: session mismatch (have: ${finalCtx.sessionId}, requested: ${sessionId})`);
  }
}

/**
 * Non-throwing, single-shot membership check for the `session` query gate.
 *
 * Unlike `requireSessionMember`, this does NOT retry with backoff — it's read
 * by a query resolver that needs an immediate member/non-member decision to
 * choose between a full payload and a redacted preview, not to block a
 * mutation/subscription while `joinSession` context propagation catches up.
 * The retrying behavior stays exclusively on `requireSessionMember`.
 *
 * Checked in order, short-circuiting on the first match:
 *   1. Local context — the connection's tracked context has a matching
 *      `sessionId` (fast path, same backend instance).
 *   2. Distributed state — `isConnectionInSession` for a WS connection
 *      tracked on a different instance. A failed lookup (Redis blip) logs
 *      and falls through to 3 rather than throwing — an error can never
 *      grant membership, but it must not 500 the query either (that would
 *      take the mobile pre-join preview down with it).
 *   3. Durable participant record — PK lookup on `board_session_participants`
 *      (same predicate as `verifyWidgetSession` in widget-session-guard.ts).
 *      Only meaningful when `ctx.userId` is set. HTTP requests get a fresh
 *      `http-<uuid>` connectionId per request (see yoga.ts), so 1–2 can never
 *      match an HTTP caller — they skip straight here — and this is the only
 *      durable signal available for an authenticated one.
 *
 * Anonymous HTTP callers with no local/distributed match — including a
 * genuine past participant who isn't currently logged in — fall through to
 * `false`. There's no stable identity to check durably in that case; this is
 * an accepted degradation (they still get the invite-preview payload, not an
 * error).
 */
export async function isSessionMember(ctx: ConnectionContext, sessionId: string): Promise<boolean> {
  // HTTP requests are stateless — never in the local context map, never in
  // distributed state — so the connection-based checks can't match; skip
  // straight to the durable record.
  if (ctx.transport !== 'http') {
    const latestCtx = getContext(ctx.connectionId);
    if (latestCtx?.sessionId === sessionId) {
      return true;
    }

    const distributedState = getDistributedState();
    if (distributedState) {
      try {
        const isInSession = await distributedState.isConnectionInSession(ctx.connectionId, sessionId);
        if (isInSession) {
          return true;
        }
      } catch (error) {
        logger.warn('[Auth] isSessionMember: distributed-state check failed; falling through to durable check', {
          connectionId: ctx.connectionId,
          sessionId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  if (ctx.userId) {
    // Primary client (`db`, not `dbRead`), matching verifyWidgetSession: the
    // participant row is written on join, and reading it from a lagging
    // replica could demote a freshly-joined authenticated HTTP caller to the
    // preview payload. A single PK-indexed row read is cheap on the primary.
    //
    // Note this also grants the full payload to an authenticated WS
    // connection that holds a past-participant row but isn't currently
    // joined. Intentional: it's the same trust signal the HTTP resync path
    // accepts — that user could fetch the same payload over HTTP anyway,
    // and could simply rejoin.
    const rows = await db
      .select({ sessionId: boardSessionParticipants.sessionId })
      .from(boardSessionParticipants)
      .where(and(eq(boardSessionParticipants.userId, ctx.userId), eq(boardSessionParticipants.sessionId, sessionId)))
      .limit(1);
    if (rows.length > 0) {
      return true;
    }
  }

  return false;
}

/**
 * Apply rate limiting to a connection.
 *
 * Two-tier enforcement strategy:
 *
 * 1. **In-memory** (all users): Fast synchronous check, per-instance.
 *    For authenticated users the key is `userId:operation`; for
 *    unauthenticated users the key is `connectionId`. This provides
 *    immediate per-process protection and works even when Redis is down.
 *
 * 2. **Redis** (authenticated users only): Distributed enforcement
 *    across multiple backend instances. Uses an atomic Lua script
 *    (INCR + EXPIRE) so counts are consistent cluster-wide.
 *
 * Authenticated users are checked by *both* tiers intentionally:
 * the in-memory check is a fast short-circuit that avoids a Redis
 * round-trip when the user is clearly over the limit on this instance,
 * while Redis ensures the limit holds across all instances.
 *
 * Unauthenticated users only get in-memory limiting because they
 * don't have a stable userId for cross-instance tracking.
 *
 * @param ctx - Connection context
 * @param limit - Optional custom limit (default: 60 requests per minute)
 * @param operation - Operation name for Redis key namespacing (default: 'default')
 */
export async function applyRateLimit(ctx: ConnectionContext, limit?: number, operation = 'default'): Promise<void> {
  if (process.env.NODE_ENV === 'development') return;

  const maxRequests = limit ?? 60;

  // Tier 1: Synchronous in-memory rate limiting (fast path, per-instance)
  // Use userId for authenticated users, clientIp for anonymous HTTP requests,
  // or connectionId as fallback (WebSocket connections)
  let key: string;
  if (ctx.isAuthenticated && ctx.userId) {
    key = `${ctx.userId}:${operation}`;
  } else if (ctx.clientIp) {
    key = `ip:${ctx.clientIp}:${operation}`;
  } else {
    key = ctx.connectionId;
  }

  // Surface a structured RATE_LIMITED error (with retryAfterSeconds) so clients
  // can branch on `extensions.code` instead of message-string matching, and the
  // generic "Action failed" toast can be replaced with a specific, gentle
  // message. Mirrors the CLIMB_IS_DUPLICATE extension pattern. The message text
  // is preserved for older clients. See #2763.
  try {
    // Tier 1: Synchronous in-memory rate limiting (fast path, per-instance)
    checkRateLimit(key, maxRequests);

    // Tier 2: Distributed Redis rate limiting (authenticated users only)
    if (ctx.isAuthenticated && ctx.userId) {
      await checkRateLimitRedis(ctx.userId, operation, maxRequests, 60_000);
    }
  } catch (error) {
    if (error instanceof RateLimitError) {
      throw new GraphQLError(error.message, {
        extensions: { code: 'RATE_LIMITED', operation, retryAfterSeconds: error.retryAfterSeconds },
      });
    }
    throw error;
  }
}

/**
 * Helper to require controller authentication via connectionParams.
 * Throws if the connection is not authenticated as a controller.
 */
export function requireControllerAuth(ctx: ConnectionContext): {
  controllerId: string;
  controllerApiKey: string;
} {
  if (!ctx.controllerId || !ctx.controllerApiKey) {
    throw new Error('Controller authentication required. Pass controllerApiKey in connectionParams.');
  }
  return { controllerId: ctx.controllerId, controllerApiKey: ctx.controllerApiKey };
}

/**
 * Helper to verify a controller is authorized for a specific session.
 *
 * Controllers are authorized if:
 * 1. The controller exists and is authenticated via API key (already verified in connectionParams)
 * 2. The session exists and is active
 *
 * The API key is the authorization - if you have it, you registered the controller
 * and can use it with any session you want to monitor. The session ID in the ESP32
 * config determines which session the controller connects to.
 */
export async function requireControllerAuthorizedForSession(
  ctx: ConnectionContext,
  sessionId: string,
): Promise<{ controllerId: string; controllerApiKey: string }> {
  const { controllerId, controllerApiKey } = requireControllerAuth(ctx);

  // Verify the controller still exists (it was already authenticated via connectionParams)
  const [controller] = await db.select().from(esp32Controllers).where(eq(esp32Controllers.id, controllerId)).limit(1);

  if (!controller) {
    throw new Error('Controller not found');
  }

  // Update the controller's authorized session (for tracking purposes)
  // This also serves as a "last used session" record
  await db
    .update(esp32Controllers)
    .set({ authorizedSessionId: sessionId })
    .where(eq(esp32Controllers.id, controllerId));

  return { controllerId, controllerApiKey };
}
