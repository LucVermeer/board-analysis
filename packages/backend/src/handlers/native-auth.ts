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

  // Verify the HMAC transfer token
  const verified = verifyTransferToken(transferToken);
  if (!verified) {
    logger.warn('[NativeAuth] Transfer token verification failed');
    sendJson(res, 401, { error: 'Invalid or expired transfer token' });
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
    // Find matching, non-revoked, non-expired refresh token
    const [existingToken] = await db
      .select()
      .from(mobileRefreshTokens)
      .where(and(eq(mobileRefreshTokens.tokenHash, tokenHash), isNull(mobileRefreshTokens.revokedAt)))
      .limit(1);

    if (!existingToken) {
      sendJson(res, 401, { error: 'Invalid refresh token' });
      return;
    }

    if (existingToken.expiresAt < new Date()) {
      // Revoke the expired token for hygiene
      await db
        .update(mobileRefreshTokens)
        .set({ revokedAt: new Date() })
        .where(eq(mobileRefreshTokens.id, existingToken.id));
      sendJson(res, 401, { error: 'Refresh token expired' });
      return;
    }

    // Revoke old token (rotation)
    await db
      .update(mobileRefreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(mobileRefreshTokens.id, existingToken.id));

    // Issue new token pair
    const tokenPair = await generateTokenPair(existingToken.userId);
    logger.info(`[NativeAuth] Token refresh successful for user ${existingToken.userId}`);
    sendJson(res, 200, tokenPair);
  } catch (error) {
    logger.error('[NativeAuth] Token refresh failed:', error);
    sendJson(res, 500, { error: 'Internal server error' });
  }
}
