import type { IncomingMessage, ServerResponse } from 'http';
import crypto from 'crypto';
import { SignJWT } from 'jose';
import { eq, and, isNull, lt, or, isNotNull } from 'drizzle-orm';
import { mobileRefreshTokens } from '@boardsesh/db/schema/auth';
import { db } from '../db/client';
import { redisClientManager } from '../redis/client';
import { applyCorsHeaders } from './cors';
import { logger } from '../utils/logger';

// Transfer tokens are short-lived (120s) and exchanged between our own
// servers, so 5s tolerance is sufficient. Long-lived JWTs use 60s in
// jose's clockTolerance to handle mobile device clock drift.
const CLOCK_SKEW_TOLERANCE_SECONDS = 5;

/**
 * Maximum allowed lifetime for a transfer token (seconds).
 * Transfer tokens are intended to live 120s. This cap (120s + 5s tolerance)
 * prevents a compromised web issuer from embedding an arbitrarily long exp.
 */
const MAX_TRANSFER_TOKEN_LIFETIME_SECONDS = 125;

/** JWT lifetime for mobile sessions. */
const JWT_EXPIRY = '7d';
const JWT_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

/** Refresh token lifetime. */
const REFRESH_TOKEN_EXPIRY_MS = 90 * 24 * 60 * 60 * 1000;

/** Maximum request body size for these endpoints. */
const MAX_BODY_BYTES = 4096;

/** JWT issuer claim for mobile tokens. */
const JWT_ISSUER = 'boardsesh';

/** JWT audience claim for mobile tokens. */
const JWT_AUDIENCE = 'boardsesh-mobile';

// ---------------------------------------------------------------------------
// Transfer token replay prevention
// ---------------------------------------------------------------------------

/**
 * In-memory fallback for consumed transfer token signatures when Redis is
 * unavailable. When Redis is connected, tokens are stored with SET NX EX for
 * atomic, multi-instance-safe replay prevention.
 */
const consumedTransferTokens = new Map<string, number>();

/** TTL for consumed token entries (125s — slightly longer than the 120s token TTL). */
const CONSUMED_TOKEN_TTL_SECONDS = 125;
const CONSUMED_TOKEN_TTL_MS = CONSUMED_TOKEN_TTL_SECONDS * 1000;

/** Cleanup interval for expired consumed token entries. */
const CONSUMED_TOKEN_CLEANUP_INTERVAL_MS = 60_000;

/** Max entries before triggering early eviction. */
const MAX_CONSUMED_TOKENS = 10_000;

/** Redis key prefix for consumed transfer tokens. */
const CONSUMED_TOKEN_REDIS_PREFIX = 'boardsesh:native-auth:consumed:';

/** Evict stale entries from the consumed-token map. */
function evictStaleConsumedTokens(): void {
  const cutoff = Date.now() - CONSUMED_TOKEN_TTL_MS;
  for (const [signature, timestamp] of consumedTransferTokens) {
    if (timestamp < cutoff) consumedTransferTokens.delete(signature);
  }
}

// Periodically evict stale consumed-token entries so the map doesn't grow unbounded.
const consumedTokenEvictionHandle = setInterval(evictStaleConsumedTokens, CONSUMED_TOKEN_CLEANUP_INTERVAL_MS);
if (typeof consumedTokenEvictionHandle.unref === 'function') consumedTokenEvictionHandle.unref();

/**
 * Attempt to mark a transfer token signature as consumed.
 * Returns 'consumed' if freshly consumed, 'replay' if already used, 'overloaded' if map is full.
 *
 * When Redis is connected, uses SET NX EX for atomic multi-instance replay prevention.
 * Falls back to the in-memory map otherwise (single-instance only).
 */
async function markTokenConsumed(tokenSignature: string): Promise<'consumed' | 'replay' | 'overloaded'> {
  if (redisClientManager.isRedisConnected()) {
    try {
      const { publisher } = redisClientManager.getClients();
      const redisKey = `${CONSUMED_TOKEN_REDIS_PREFIX}${tokenSignature}`;
      // SET key "1" NX EX 125 — returns "OK" if set, null if key already existed
      const result = await publisher.set(redisKey, '1', 'EX', CONSUMED_TOKEN_TTL_SECONDS, 'NX');
      return result === 'OK' ? 'consumed' : 'replay';
    } catch (error) {
      // Redis failure: fall through to in-memory map so the endpoint stays available.
      logger.warn('[NativeAuth] Redis SET NX failed for consumed token, falling back to in-memory:', error);
    }
  }

  // In-memory fallback (single-instance only)
  if (consumedTransferTokens.has(tokenSignature)) {
    return 'replay';
  }

  if (consumedTransferTokens.size >= MAX_CONSUMED_TOKENS) {
    evictStaleConsumedTokens();
    if (consumedTransferTokens.size >= MAX_CONSUMED_TOKENS) {
      return 'overloaded';
    }
  }

  consumedTransferTokens.set(tokenSignature, Date.now());
  return 'consumed';
}

/**
 * Check if a transfer token signature has already been consumed (read-only check).
 * Used for the early-reject path before verifying the HMAC.
 */
async function isTokenConsumed(tokenSignature: string): Promise<boolean> {
  if (redisClientManager.isRedisConnected()) {
    try {
      const { publisher } = redisClientManager.getClients();
      const redisKey = `${CONSUMED_TOKEN_REDIS_PREFIX}${tokenSignature}`;
      const result = await publisher.exists(redisKey);
      return result === 1;
    } catch (error) {
      logger.warn('[NativeAuth] Redis EXISTS failed for consumed token, falling back to in-memory:', error);
    }
  }
  return consumedTransferTokens.has(tokenSignature);
}

// ---------------------------------------------------------------------------
// IP-based rate limiting for auth endpoints
//
// Per-instance only — with N backend instances the effective limit is
// AUTH_RATE_LIMIT_MAX × N per IP. Redis-backed rate limiting would add
// a round-trip to every auth request for marginal benefit given that
// the high-risk replay path is already Redis-backed (SET NX EX).
// ---------------------------------------------------------------------------

type AuthRateLimitEntry = {
  count: number;
  resetAt: number;
};

/** Rate limit state per IP address. */
const authRateLimitMap = new Map<string, AuthRateLimitEntry>();

/** Maximum auth requests per IP per minute. */
const AUTH_RATE_LIMIT_MAX = 10;

/** Rate limit window in milliseconds (1 minute). */
const AUTH_RATE_LIMIT_WINDOW_MS = 60_000;

/** Max entries before triggering early eviction. */
const MAX_RATE_LIMIT_ENTRIES = 50_000;

/** Evict expired entries from the rate limit map. */
function evictExpiredRateLimitEntries(): void {
  const now = Date.now();
  for (const [ipAddress, entry] of authRateLimitMap) {
    if (now > entry.resetAt) authRateLimitMap.delete(ipAddress);
  }
}

// Periodically clean up expired rate limit entries.
const rateLimitEvictionHandle = setInterval(evictExpiredRateLimitEntries, AUTH_RATE_LIMIT_WINDOW_MS);
if (typeof rateLimitEvictionHandle.unref === 'function') rateLimitEvictionHandle.unref();

/**
 * Check if an IP address has exceeded the auth endpoint rate limit.
 * Returns the number of seconds until the limit resets, or null if allowed.
 * Returns -1 if the rate limit map is full and cannot accept new entries
 * (callers should respond with 503).
 */
function checkAuthRateLimit(ipAddress: string): number | null {
  const now = Date.now();
  const entry = authRateLimitMap.get(ipAddress);

  if (!entry || now > entry.resetAt) {
    // New entry — check map bounds before inserting
    if (!entry && authRateLimitMap.size >= MAX_RATE_LIMIT_ENTRIES) {
      evictExpiredRateLimitEntries();
      if (authRateLimitMap.size >= MAX_RATE_LIMIT_ENTRIES) {
        logger.warn(`[NativeAuth] Rate limit map full (${authRateLimitMap.size} entries)`);
        return -1;
      }
    }
    authRateLimitMap.set(ipAddress, { count: 1, resetAt: now + AUTH_RATE_LIMIT_WINDOW_MS });
    return null;
  }

  if (entry.count >= AUTH_RATE_LIMIT_MAX) {
    return Math.ceil((entry.resetAt - now) / 1000);
  }

  entry.count++;
  return null;
}

/**
 * Extract the client IP from an incoming request.
 *
 * Uses `req.socket.remoteAddress` exclusively. X-Forwarded-For is user-controlled
 * and trusting its leftmost entry lets attackers bypass the rate limiter by
 * spoofing arbitrary IPs. Behind a reverse proxy (e.g. Railway), remoteAddress
 * is the proxy IP, which means all clients share one rate-limit bucket — overly
 * permissive but not bypassable.
 */
function getClientIp(req: IncomingMessage): string {
  return req.socket.remoteAddress ?? 'unknown';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalLength = 0;

    req.on('data', (chunk: Buffer) => {
      totalLength += chunk.length;
      if (totalLength > MAX_BODY_BYTES) {
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

function getSigningSecret(): Uint8Array | null {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) return null;
  return new TextEncoder().encode(secret);
}

// ---------------------------------------------------------------------------
// Transfer token verification (mirrors packages/web native-oauth-transfer.ts)
// ---------------------------------------------------------------------------

type TransferPayload = {
  userId: string;
  nextPath: string;
  iat: number;
  exp: number;
};

function verifyTransferToken(token: string): { userId: string } | null {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    logger.warn('[NativeAuth] NEXTAUTH_SECRET not configured');
    return null;
  }

  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return null;
  }
  const [encodedPayload, signature] = parts;

  const expectedSignature = crypto.createHmac('sha256', secret).update(encodedPayload).digest('base64url');

  const sigBuffer = Buffer.from(signature);
  const expectedSigBuffer = Buffer.from(expectedSignature);

  // Pad both buffers to the same length so the comparison is always
  // constant-time — no length oracle, no JIT short-circuit.
  const maxLen = Math.max(sigBuffer.length, expectedSigBuffer.length);
  const paddedSig = Buffer.alloc(maxLen);
  const paddedExpected = Buffer.alloc(maxLen);
  sigBuffer.copy(paddedSig);
  expectedSigBuffer.copy(paddedExpected);

  if (!crypto.timingSafeEqual(paddedSig, paddedExpected)) {
    return null;
  }

  let payload: TransferPayload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as TransferPayload;
  } catch {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (
    !payload.userId ||
    !payload.exp ||
    !payload.iat ||
    payload.exp < now - CLOCK_SKEW_TOLERANCE_SECONDS ||
    payload.iat > now + CLOCK_SKEW_TOLERANCE_SECONDS
  ) {
    return null;
  }

  // Reject tokens with an unreasonably long lifetime (e.g. a compromised
  // web issuer embedding a far-future exp).
  if (payload.exp - payload.iat > MAX_TRANSFER_TOKEN_LIFETIME_SECONDS) {
    return null;
  }

  return { userId: payload.userId };
}

// ---------------------------------------------------------------------------
// Token generation helpers
// ---------------------------------------------------------------------------

async function generateTokenPair(userId: string): Promise<{
  jwt: string;
  refreshToken: string;
  expiresAt: string;
}> {
  const signingSecret = getSigningSecret();
  if (!signingSecret) {
    throw new Error('NEXTAUTH_SECRET is not configured');
  }

  // Generate JWT
  const jwtExpiresAt = new Date(Date.now() + JWT_EXPIRY_MS);
  const jwt = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setExpirationTime(JWT_EXPIRY)
    .sign(signingSecret);

  // Generate refresh token and store its hash
  const refreshToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

  await db.insert(mobileRefreshTokens).values({
    userId,
    tokenHash,
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS),
  });

  return {
    jwt,
    refreshToken,
    expiresAt: jwtExpiresAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// POST /auth/native/exchange
// ---------------------------------------------------------------------------

export async function handleNativeAuthExchange(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!applyCorsHeaders(req, res)) return;

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  // Rate limit by IP
  const clientIp = getClientIp(req);
  const retryAfter = checkAuthRateLimit(clientIp);
  if (retryAfter === -1) {
    sendJson(res, 503, { error: 'Service temporarily overloaded' });
    return;
  }
  if (retryAfter !== null) {
    res.setHeader('Retry-After', String(retryAfter));
    sendJson(res, 429, { error: `Rate limit exceeded. Try again in ${retryAfter} seconds.` });
    return;
  }

  let body: unknown;
  try {
    const raw = await readBody(req);
    body = JSON.parse(raw);
  } catch {
    sendJson(res, 400, { error: 'Invalid JSON body' });
    return;
  }

  if (typeof body !== 'object' || body === null) {
    sendJson(res, 400, { error: 'Request body must be a JSON object' });
    return;
  }

  const { transferToken } = body as Record<string, unknown>;
  if (typeof transferToken !== 'string' || transferToken.length === 0) {
    sendJson(res, 400, { error: 'transferToken is required' });
    return;
  }

  // Extract the signature before verification so we can check for replay
  const tokenParts = transferToken.split('.');
  if (tokenParts.length !== 2 || !tokenParts[1]) {
    sendJson(res, 401, { error: 'Invalid or expired transfer token' });
    return;
  }
  const tokenSignature = tokenParts[1];

  // Check if this transfer token has already been consumed (replay prevention)
  if (await isTokenConsumed(tokenSignature)) {
    logger.warn('[NativeAuth] Transfer token replay attempt detected');
    sendJson(res, 409, { error: 'Transfer token has already been used' });
    return;
  }

  // Verify the HMAC transfer token
  const verified = verifyTransferToken(transferToken);
  if (!verified) {
    logger.warn('[NativeAuth] Transfer token verification failed');
    sendJson(res, 401, { error: 'Invalid or expired transfer token' });
    return;
  }

  // Atomically mark the token as consumed. If another request consumed it
  // between the EXISTS check above and now, markTokenConsumed returns 'replay'.
  const consumeResult = await markTokenConsumed(tokenSignature);
  if (consumeResult === 'replay') {
    logger.warn('[NativeAuth] Transfer token replay attempt detected (race)');
    sendJson(res, 409, { error: 'Transfer token has already been used' });
    return;
  }
  if (consumeResult === 'overloaded') {
    logger.error('[NativeAuth] Consumed token map full — rejecting request');
    sendJson(res, 503, { error: 'Service temporarily overloaded' });
    return;
  }

  try {
    const tokenPair = await generateTokenPair(verified.userId);
    logger.info(`[NativeAuth] Token exchange successful for user ${verified.userId}`);
    sendJson(res, 200, tokenPair);
  } catch (error) {
    logger.error('[NativeAuth] Token generation failed:', error);
    sendJson(res, 500, { error: 'Internal server error' });
  }
}

// ---------------------------------------------------------------------------
// POST /auth/native/refresh
// ---------------------------------------------------------------------------

export async function handleNativeAuthRefresh(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!applyCorsHeaders(req, res)) return;

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  // Rate limit by IP
  const clientIp = getClientIp(req);
  const retryAfter = checkAuthRateLimit(clientIp);
  if (retryAfter === -1) {
    sendJson(res, 503, { error: 'Service temporarily overloaded' });
    return;
  }
  if (retryAfter !== null) {
    res.setHeader('Retry-After', String(retryAfter));
    sendJson(res, 429, { error: `Rate limit exceeded. Try again in ${retryAfter} seconds.` });
    return;
  }

  let body: unknown;
  try {
    const raw = await readBody(req);
    body = JSON.parse(raw);
  } catch {
    sendJson(res, 400, { error: 'Invalid JSON body' });
    return;
  }

  if (typeof body !== 'object' || body === null) {
    sendJson(res, 400, { error: 'Request body must be a JSON object' });
    return;
  }

  const { refreshToken } = body as Record<string, unknown>;
  if (typeof refreshToken !== 'string' || refreshToken.length === 0) {
    sendJson(res, 400, { error: 'refreshToken is required' });
    return;
  }

  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

  try {
    // Atomically revoke the token and return it in a single query.
    // This prevents TOCTOU races: if two concurrent requests present the same
    // refresh token, only one will get the row back — the other gets an empty
    // result because the WHERE clause requires revoked_at IS NULL.
    const revokedRows = await db
      .update(mobileRefreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(mobileRefreshTokens.tokenHash, tokenHash), isNull(mobileRefreshTokens.revokedAt)))
      .returning();

    const revokedToken = revokedRows[0];

    if (!revokedToken) {
      sendJson(res, 401, { error: 'Invalid refresh token' });
      return;
    }

    if (revokedToken.expiresAt < new Date()) {
      // Token was already expired — we revoked it for hygiene but won't issue new tokens
      sendJson(res, 401, { error: 'Refresh token expired' });
      return;
    }

    // Issue new token pair
    const tokenPair = await generateTokenPair(revokedToken.userId);
    logger.info(`[NativeAuth] Token refresh successful for user ${revokedToken.userId}`);
    sendJson(res, 200, tokenPair);
  } catch (error) {
    logger.error('[NativeAuth] Token refresh failed:', error);
    sendJson(res, 500, { error: 'Internal server error' });
  }
}

// ---------------------------------------------------------------------------
// POST /auth/native/revoke
// ---------------------------------------------------------------------------

export async function handleNativeAuthRevoke(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!applyCorsHeaders(req, res)) return;

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  // No rate limiting for revoke — the endpoint requires a valid refresh token
  // (a secret), so it's already gated. Exempting it prevents aggressive retry
  // loops from locking a user out of sign-out.

  let body: unknown;
  try {
    const raw = await readBody(req);
    body = JSON.parse(raw);
  } catch {
    sendJson(res, 400, { error: 'Invalid JSON body' });
    return;
  }

  if (typeof body !== 'object' || body === null) {
    sendJson(res, 400, { error: 'Request body must be a JSON object' });
    return;
  }

  const { refreshToken } = body as Record<string, unknown>;
  if (typeof refreshToken !== 'string' || refreshToken.length === 0) {
    sendJson(res, 400, { error: 'refreshToken is required' });
    return;
  }

  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

  try {
    // Look up the token to find the user. Only non-revoked tokens are valid
    // for initiating a full sign-out.
    const matchingRows = await db
      .update(mobileRefreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(mobileRefreshTokens.tokenHash, tokenHash), isNull(mobileRefreshTokens.revokedAt)))
      .returning({ userId: mobileRefreshTokens.userId });

    const matchedToken = matchingRows[0];

    if (!matchedToken) {
      sendJson(res, 401, { error: 'Invalid refresh token' });
      return;
    }

    // Revoke ALL remaining non-revoked tokens for this user (full sign-out).
    // The token we just revoked above is already covered, but the WHERE clause
    // filters on revokedAt IS NULL so it's a no-op for that row.
    await db
      .update(mobileRefreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(mobileRefreshTokens.userId, matchedToken.userId), isNull(mobileRefreshTokens.revokedAt)));

    logger.info(`[NativeAuth] All tokens revoked for user ${matchedToken.userId}`);
    sendJson(res, 200, { revoked: true });
  } catch (error) {
    logger.error('[NativeAuth] Token revocation failed:', error);
    sendJson(res, 500, { error: 'Internal server error' });
  }
}

// ---------------------------------------------------------------------------
// Periodic cleanup of expired / revoked refresh tokens
// ---------------------------------------------------------------------------

/** How often to run the cleanup (every 6 hours). */
const REFRESH_TOKEN_CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** Revoked tokens older than this are deleted (7 days). */
const REVOKED_TOKEN_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

let refreshTokenCleanupHandle: ReturnType<typeof setInterval> | null = null;

async function runRefreshTokenCleanup(): Promise<void> {
  const revokedCutoff = new Date(Date.now() - REVOKED_TOKEN_RETENTION_MS);
  const now = new Date();
  try {
    const result = await db
      .delete(mobileRefreshTokens)
      .where(
        or(
          // Revoked tokens older than 7 days
          and(isNotNull(mobileRefreshTokens.revokedAt), lt(mobileRefreshTokens.revokedAt, revokedCutoff)),
          // Expired tokens
          lt(mobileRefreshTokens.expiresAt, now),
        ),
      )
      .returning({ id: mobileRefreshTokens.id });
    if (result.length > 0) {
      logger.info(`[NativeAuth Cleanup] Removed ${String(result.length)} expired/revoked refresh token(s)`);
    }
  } catch (error) {
    logger.error('[NativeAuth Cleanup] Failed to remove expired refresh tokens:', error);
  }
}

/** Start the periodic refresh token cleanup loop. */
export function startRefreshTokenCleanup(): void {
  if (refreshTokenCleanupHandle !== null) return;
  logger.info(
    `[NativeAuth Cleanup] Started (interval=${String(REFRESH_TOKEN_CLEANUP_INTERVAL_MS)}ms, ` +
      `revokedRetention=${String(REVOKED_TOKEN_RETENTION_MS / (24 * 60 * 60 * 1000))}d)`,
  );

  // Run once shortly after startup, then on the regular interval.
  const initialDelay = setTimeout(() => {
    runRefreshTokenCleanup().catch((error) => {
      logger.error('[NativeAuth Cleanup] Initial tick failed:', error);
    });
  }, 60 * 1000);
  if (typeof initialDelay.unref === 'function') initialDelay.unref();

  refreshTokenCleanupHandle = setInterval(() => {
    runRefreshTokenCleanup().catch((error) => {
      logger.error('[NativeAuth Cleanup] Tick failed:', error);
    });
  }, REFRESH_TOKEN_CLEANUP_INTERVAL_MS);

  if (typeof refreshTokenCleanupHandle.unref === 'function') refreshTokenCleanupHandle.unref();
}

export function stopRefreshTokenCleanup(): void {
  if (refreshTokenCleanupHandle === null) return;
  clearInterval(refreshTokenCleanupHandle);
  refreshTokenCleanupHandle = null;
  logger.info('[NativeAuth Cleanup] Stopped');
}

// ---------------------------------------------------------------------------
// Test-only utilities
// ---------------------------------------------------------------------------

/** Reset the in-memory rate limit and consumed token maps. Test-only. */
export function __resetNativeAuthStateForTests(): void {
  authRateLimitMap.clear();
  consumedTransferTokens.clear();
}

/** Run the refresh token cleanup tick directly. Test-only. */
export async function __runRefreshTokenCleanupForTests(): Promise<void> {
  await runRefreshTokenCleanup();
}
