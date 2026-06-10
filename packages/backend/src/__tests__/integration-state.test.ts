// @ts-nocheck — __tests__ is excluded from tsconfig.json, so the type-aware
// lint can't resolve node globals or `node:*` specifiers. Type-checking happens
// at test-run time via vitest.
import crypto from 'node:crypto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vite-plus/test';

const TEST_SECRET = 'test-secret-for-integration-state';
process.env.NEXTAUTH_SECRET = TEST_SECRET;

import { signIntegrationState, verifyIntegrationState } from '../integrations/state';

describe('integration state token', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('roundtrips a userId + provider', () => {
    const state = signIntegrationState({ userId: 'user-42', provider: 'strava' });
    const verified = verifyIntegrationState(state);
    expect(verified).toEqual({ userId: 'user-42', provider: 'strava' });
  });

  it('rejects a tampered signature', () => {
    const state = signIntegrationState({ userId: 'user-42', provider: 'strava' });
    const [payload, signature] = state.split('.');
    // Flip the last character of the signature.
    const lastChar = signature.slice(-1) === 'A' ? 'B' : 'A';
    const tampered = `${payload}.${signature.slice(0, -1)}${lastChar}`;
    expect(verifyIntegrationState(tampered)).toBeNull();
  });

  it('rejects a tampered payload (signature no longer matches)', () => {
    const state = signIntegrationState({ userId: 'user-42', provider: 'strava' });
    const [, signature] = state.split('.');
    const forgedPayload = Buffer.from(
      JSON.stringify({
        userId: 'attacker',
        provider: 'strava',
        nonce: 'x',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 600,
      }),
    ).toString('base64url');
    expect(verifyIntegrationState(`${forgedPayload}.${signature}`)).toBeNull();
  });

  it('rejects an expired token', () => {
    const now = Date.now();
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const state = signIntegrationState({ userId: 'user-42', provider: 'strava' });
    // Advance past the 10-minute lifetime + skew tolerance.
    vi.setSystemTime(now + 11 * 60 * 1000);
    expect(verifyIntegrationState(state)).toBeNull();
  });

  it('rejects malformed input', () => {
    expect(verifyIntegrationState('')).toBeNull();
    expect(verifyIntegrationState('no-dot')).toBeNull();
    expect(verifyIntegrationState('a.b.c')).toBeNull();
    expect(verifyIntegrationState('.sig')).toBeNull();
    expect(verifyIntegrationState('payload.')).toBeNull();
  });

  it('rejects an unsupported provider in a validly-signed payload', () => {
    // Sign a payload with an unknown provider directly so the signature is valid
    // but verification must still reject the unsupported provider.
    const now = Math.floor(Date.now() / 1000);
    const payload = Buffer.from(
      JSON.stringify({ userId: 'user-42', provider: 'garmin', nonce: 'n', iat: now, exp: now + 600 }),
    ).toString('base64url');
    const signature = crypto.createHmac('sha256', TEST_SECRET).update(payload).digest('base64url');
    expect(verifyIntegrationState(`${payload}.${signature}`)).toBeNull();
  });

  it('callback provider mismatch is detectable by the caller', () => {
    // verifyIntegrationState returns the embedded provider; the callback compares
    // it against the URL's provider segment. Confirm the embedded provider is
    // surfaced so a mismatch can be caught.
    const state = signIntegrationState({ userId: 'user-1', provider: 'strava' });
    const verified = verifyIntegrationState(state);
    expect(verified?.provider).toBe('strava');
  });
});
