import crypto from 'crypto';
import { KILTER_BOARD_TYPE } from '@boardsesh/kilter-sync/api';
import { logger } from '../utils/logger';

const HKDF_INFO = 'boardsesh-board-credential-oauth-tokens-v1';
const STATE_LIFETIME_SECONDS = 10 * 60;
const HANDOFF_LIFETIME_SECONDS = 60;
const CLOCK_SKEW_TOLERANCE_SECONDS = 5;

type BoardCredentialProvider = typeof KILTER_BOARD_TYPE;
type TokenPurpose = 'board-credential-oauth-state' | 'board-credential-oauth-handoff';

type SignedPayload = {
  purpose: TokenPurpose;
  userId: string;
  provider: BoardCredentialProvider;
  nonce: string;
  iat: number;
  exp: number;
};

export type VerifiedBoardCredentialToken = {
  userId: string;
  provider: BoardCredentialProvider;
  nonce: string;
};

let cachedSigningKey: { secret: string; key: Buffer } | null = null;

function getSigningKey(): Buffer | null {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) return null;
  if (cachedSigningKey && cachedSigningKey.secret === secret) return cachedSigningKey.key;

  const derived = Buffer.from(crypto.hkdfSync('sha256', secret, '', HKDF_INFO, 32));
  cachedSigningKey = { secret, key: derived };
  return derived;
}

function isSupportedBoardCredentialProvider(provider: string): provider is BoardCredentialProvider {
  return provider === KILTER_BOARD_TYPE;
}

function signPayload(
  input: { userId: string; provider: BoardCredentialProvider },
  purpose: TokenPurpose,
  lifetimeSeconds: number,
): string {
  const signingKey = getSigningKey();
  if (!signingKey) {
    throw new Error('NEXTAUTH_SECRET is not configured');
  }

  const now = Math.floor(Date.now() / 1000);
  const payload: SignedPayload = {
    purpose,
    userId: input.userId,
    provider: input.provider,
    nonce: crypto.randomBytes(16).toString('base64url'),
    iat: now,
    exp: now + lifetimeSeconds,
  };

  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = crypto.createHmac('sha256', signingKey).update(encodedPayload).digest('base64url');
  return `${encodedPayload}.${signature}`;
}

function verifySignedPayload(
  token: string,
  expectedPurpose: TokenPurpose,
  lifetimeSeconds: number,
): VerifiedBoardCredentialToken | null {
  const signingKey = getSigningKey();
  if (!signingKey) {
    logger.warn('[BoardCredentials] NEXTAUTH_SECRET not configured');
    return null;
  }

  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const [encodedPayload, signature] = parts;

  const expectedSignature = crypto.createHmac('sha256', signingKey).update(encodedPayload).digest('base64url');
  const signatureBuffer = Buffer.from(signature);
  const expectedSignatureBuffer = Buffer.from(expectedSignature);
  const maxLength = Math.max(signatureBuffer.length, expectedSignatureBuffer.length);
  const paddedSignature = Buffer.alloc(maxLength);
  const paddedExpectedSignature = Buffer.alloc(maxLength);
  signatureBuffer.copy(paddedSignature);
  expectedSignatureBuffer.copy(paddedExpectedSignature);

  if (!crypto.timingSafeEqual(paddedSignature, paddedExpectedSignature)) {
    return null;
  }

  let payload: SignedPayload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as SignedPayload;
  } catch {
    return null;
  }

  if (payload.purpose !== expectedPurpose) return null;

  const now = Math.floor(Date.now() / 1000);
  if (
    !payload.userId ||
    !payload.provider ||
    !payload.nonce ||
    !payload.exp ||
    !payload.iat ||
    payload.exp < now - CLOCK_SKEW_TOLERANCE_SECONDS ||
    payload.iat > now + CLOCK_SKEW_TOLERANCE_SECONDS
  ) {
    return null;
  }

  if (payload.exp - payload.iat > lifetimeSeconds + CLOCK_SKEW_TOLERANCE_SECONDS) {
    return null;
  }

  if (!isSupportedBoardCredentialProvider(payload.provider)) {
    return null;
  }

  return { userId: payload.userId, provider: payload.provider, nonce: payload.nonce };
}

export function signBoardCredentialState(input: { userId: string; provider: BoardCredentialProvider }): string {
  return signPayload(input, 'board-credential-oauth-state', STATE_LIFETIME_SECONDS);
}

export function verifyBoardCredentialState(state: string): VerifiedBoardCredentialToken | null {
  return verifySignedPayload(state, 'board-credential-oauth-state', STATE_LIFETIME_SECONDS);
}

export function signBoardCredentialHandoff(input: { userId: string; provider: BoardCredentialProvider }): string {
  return signPayload(input, 'board-credential-oauth-handoff', HANDOFF_LIFETIME_SECONDS);
}

export function verifyBoardCredentialHandoff(handoff: string): VerifiedBoardCredentialToken | null {
  return verifySignedPayload(handoff, 'board-credential-oauth-handoff', HANDOFF_LIFETIME_SECONDS);
}
