import type { ConnectionContext } from '@boardsesh/shared-schema';
import { activityPushTokens } from '@boardsesh/db/schema/app';
import { boardSessionParticipants } from '../../../db/schema';
import { and, count, eq } from 'drizzle-orm';
import { db } from '../../../db/client';

/**
 * APNs ActivityKit device tokens are 32-byte values rendered as hex strings,
 * so 64 hex characters in the common case. We accept the slightly broader
 * 32–128 hex range to be forward-compatible with any future APNs token
 * length changes while still rejecting obviously malformed input.
 */
const APNS_TOKEN_PATTERN = /^[0-9a-fA-F]{32,128}$/;

/** Per-session cap on registered push tokens. Bounds blast radius if a single
 *  session somehow accumulates many tokens (e.g. user reinstalls repeatedly). */
const MAX_TOKENS_PER_SESSION = 8;

/**
 * Per-(userId, sessionId) token bucket protecting the push-token mutations
 * from authenticated-but-abusive write floods.
 *
 * The mutations are auth-gated and participant-checked, but auth alone doesn't
 * bound write traffic — a participant can still flood register/unregister and
 * churn the activity_push_tokens table. Bucket: 5 capacity, refill 1 token /
 * 2s. So 5 rapid mutations succeed; sustained traffic is limited to ~30
 * req/min per (user, session).
 *
 * In-memory only — defense-in-depth, not a hard quota. The cap of 8 tokens
 * per session in the upsert path is the authoritative bound on DB row count.
 */
const TOKEN_MUTATION_BUCKET_CAPACITY = 5;
const TOKEN_MUTATION_REFILL_PER_SECOND = 1 / 2;
const TOKEN_MUTATION_BUCKET_TTL_MS = 5 * 60 * 1000;
const TOKEN_MUTATION_PRUNE_INTERVAL_MS = 5 * 60 * 1000;

interface TokenMutationBucket {
  tokens: number;
  lastRefillMs: number;
}

const tokenMutationBuckets = new Map<string, TokenMutationBucket>();
let prunerHandle: ReturnType<typeof setInterval> | null = null;

function ensurePrunerRunning(): void {
  if (prunerHandle !== null) return;
  prunerHandle = setInterval(() => {
    const cutoff = Date.now() - TOKEN_MUTATION_BUCKET_TTL_MS;
    for (const [key, bucket] of tokenMutationBuckets) {
      if (bucket.lastRefillMs < cutoff) {
        tokenMutationBuckets.delete(key);
      }
    }
  }, TOKEN_MUTATION_PRUNE_INTERVAL_MS);
  if (typeof prunerHandle.unref === 'function') prunerHandle.unref();
}

function checkTokenMutationRateLimit(userId: string, sessionId: string): boolean {
  ensurePrunerRunning();
  const key = `${userId}:${sessionId}`;
  const now = Date.now();
  const existing = tokenMutationBuckets.get(key);

  if (!existing) {
    tokenMutationBuckets.set(key, { tokens: TOKEN_MUTATION_BUCKET_CAPACITY - 1, lastRefillMs: now });
    return true;
  }

  const elapsedSeconds = (now - existing.lastRefillMs) / 1000;
  const refilled = Math.min(
    TOKEN_MUTATION_BUCKET_CAPACITY,
    existing.tokens + elapsedSeconds * TOKEN_MUTATION_REFILL_PER_SECOND,
  );
  existing.lastRefillMs = now;

  if (refilled < 1) {
    existing.tokens = refilled;
    return false;
  }
  existing.tokens = refilled - 1;
  return true;
}

/** Test-only utility for clearing in-memory rate-limit state between tests. */
export function __resetPushTokenRateLimitForTests(): void {
  tokenMutationBuckets.clear();
  if (prunerHandle !== null) {
    clearInterval(prunerHandle);
    prunerHandle = null;
  }
}

/**
 * Verify that the authenticated user has joined the session at some point.
 * Reads from `board_session_participants`, which is the permanent (non-disconnect)
 * record of session participation written by the room manager on join.
 */
async function isParticipant(userId: string, sessionId: string): Promise<boolean> {
  const rows = await db
    .select({ sessionId: boardSessionParticipants.sessionId })
    .from(boardSessionParticipants)
    .where(and(eq(boardSessionParticipants.userId, userId), eq(boardSessionParticipants.sessionId, sessionId)))
    .limit(1);
  return rows.length > 0;
}

export const pushTokenMutations = {
  /**
   * Register (upsert) an APNs device token for Live Activity push updates.
   * Requires authentication and that the caller is a participant in the session.
   * If the token already exists, updates the associated sessionId and updatedAt.
   */
  registerActivityPushToken: async (
    _: unknown,
    { sessionId, token }: { sessionId: string; token: string },
    ctx: ConnectionContext,
  ) => {
    if (!ctx.isAuthenticated || !ctx.userId) {
      throw new Error('Authentication required to perform this operation');
    }

    if (!sessionId || !token) {
      throw new Error('sessionId and token are required');
    }

    if (!APNS_TOKEN_PATTERN.test(token)) {
      throw new Error('Invalid APNs token format');
    }

    if (!checkTokenMutationRateLimit(ctx.userId, sessionId)) {
      throw new Error('Too many push-token requests, please retry later');
    }

    if (!(await isParticipant(ctx.userId, sessionId))) {
      throw new Error('Unauthorized: not a participant in this session');
    }

    // Bound the number of tokens per session. Count first; if at the cap,
    // delete the oldest before inserting so we never blow past the limit.
    const [{ value: currentCount } = { value: 0 }] = await db
      .select({ value: count() })
      .from(activityPushTokens)
      .where(eq(activityPushTokens.sessionId, sessionId));

    if (currentCount >= MAX_TOKENS_PER_SESSION) {
      const oldest = await db
        .select({ token: activityPushTokens.token })
        .from(activityPushTokens)
        .where(eq(activityPushTokens.sessionId, sessionId))
        .orderBy(activityPushTokens.updatedAt)
        .limit(currentCount - MAX_TOKENS_PER_SESSION + 1);

      if (oldest.length > 0) {
        for (const row of oldest) {
          await db.delete(activityPushTokens).where(eq(activityPushTokens.token, row.token));
        }
      }
    }

    await db
      .insert(activityPushTokens)
      .values({
        token,
        sessionId,
      })
      .onConflictDoUpdate({
        target: activityPushTokens.token,
        set: {
          sessionId,
          updatedAt: new Date(),
        },
      });

    return true;
  },

  /**
   * Unregister an APNs device token by deleting it from the database.
   * Requires authentication and that the caller is a participant in `sessionId`.
   * The delete is scoped to (token, sessionId) so an attacker holding a leaked
   * token cannot wipe another session's registration.
   */
  unregisterActivityPushToken: async (
    _: unknown,
    { sessionId, token }: { sessionId: string; token: string },
    ctx: ConnectionContext,
  ) => {
    if (!ctx.isAuthenticated || !ctx.userId) {
      throw new Error('Authentication required to perform this operation');
    }

    if (!sessionId || !token) {
      throw new Error('sessionId and token are required');
    }

    if (!APNS_TOKEN_PATTERN.test(token)) {
      throw new Error('Invalid APNs token format');
    }

    if (!checkTokenMutationRateLimit(ctx.userId, sessionId)) {
      throw new Error('Too many push-token requests, please retry later');
    }

    if (!(await isParticipant(ctx.userId, sessionId))) {
      throw new Error('Unauthorized: not a participant in this session');
    }

    await db
      .delete(activityPushTokens)
      .where(and(eq(activityPushTokens.token, token), eq(activityPushTokens.sessionId, sessionId)));

    return true;
  },
};
