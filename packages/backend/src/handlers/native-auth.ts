import type { IncomingMessage, ServerResponse } from 'http';
import crypto from 'crypto';
import { SignJWT } from 'jose';
import { eq, and, isNull } from 'drizzle-orm';
import { mobileRefreshTokens } from '@boardsesh/db/schema/auth';
import { db } from '../db/client';
import { applyCorsHeaders } from './cors';
import { logger } from '../utils/logger';

/** Clock skew tolerance when verifying transfer token expiry (seconds). */
const CLOCK_SKEW_TOLERANCE_SECONDS = 5;

/** JWT lifetime for mobile sessions. */
const JWT_EXPIRY = '30d';
const JWT_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;

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

/** Map of consumed transfer token signatures → consumption timestamp (ms). */
const consumedTransferTokens = new Map<string, number>();

/** TTL for consumed token entries (125s — slightly longer than the 120s token TTL). */
const CONSUMED_TOKEN_TTL_MS = 125_000;

/** Cleanup interval for expired consumed token entries. */
const CONSUMED_TOKEN_CLEANUP_INTERVAL_MS = 60_000;

/** Max entries before triggering early eviction. */
const MAX_CONSUMED_TOKENS = 10_000;

/** Evict stale entries from the consumed-token map. */
function evictStaleConsumedTokens(): void {
  const cutoff = Date.now() - CONSUMED_TOKEN_TTL_MS;
  for (const [signature, timestamp] of consumedTransferTokens) {
    if (timestamp < cutoff) consumedTransferTokens.delete(signature);
  }
}

// Periodically evict stale consumed-token entries so the map doesn't grow unbounded.
setInterval(evictStaleConsumedTokens, CONSUMED_TOKEN_CLEANUP_INTERVAL_MS);

// ---------------------------------------------------------------------------
// IP-based rate limiting for auth endpoints
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
setInterval(evictExpiredRateLimitEntries, AUTH_RATE_LIMIT_WINDOW_MS);

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

/** Extract the client IP from an incoming request. */
function getClientIp(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  if (Array.isArray(forwarded) && forwarded.length > 0) return forwarded[0].split(',')[0].trim();
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

  if (sigBuffer.length !== expectedSigBuffer.length) {
    // Constant-time no-op so this branch takes the same time as the
    // valid-length comparison below.
    crypto.timingSafeEqual(expectedSigBuffer, expectedSigBuffer);
    return null;
  }

  if (!crypto.timingSafeEqual(sigBuffer, expectedSigBuffer)) {
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
  const refreshToken = crypto.randomUUID();
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
  if (consumedTransferTokens.has(tokenSignature)) {
    logger.warn('[NativeAuth] Transfer token replay attempt detected');
    sendJson(res, 401, { error: 'Invalid or expired transfer token' });
    return;
  }

  // Verify the HMAC transfer token
  const verified = verifyTransferToken(transferToken);
  if (!verified) {
    logger.warn('[NativeAuth] Transfer token verification failed');
    sendJson(res, 401, { error: 'Invalid or expired transfer token' });
    return;
  }

  // Guard against unbounded map growth under distributed attacks
  if (consumedTransferTokens.size >= MAX_CONSUMED_TOKENS) {
    evictStaleConsumedTokens();
    if (consumedTransferTokens.size >= MAX_CONSUMED_TOKENS) {
      logger.warn(`[NativeAuth] Consumed token map full (${consumedTransferTokens.size} entries)`);
      sendJson(res, 503, { error: 'Service temporarily overloaded' });
      return;
    }
  }

  // Mark token as consumed to prevent replay within the TTL window
  consumedTransferTokens.set(tokenSignature, Date.now());

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
