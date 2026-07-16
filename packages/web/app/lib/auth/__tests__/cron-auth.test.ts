import { describe, expect, it, afterEach, vi } from 'vite-plus/test';
import { requireCronAuth } from '../cron-auth';

describe('requireCronAuth', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 401 when CRON_SECRET is not configured', () => {
    vi.stubEnv('CRON_SECRET', '');

    const response = requireCronAuth(
      new Request('http://localhost/api/internal/cleanup', {
        headers: { authorization: 'Bearer anything' },
      }),
    );

    expect(response?.status).toBe(401);
  });

  it('returns 401 when the authorization header is missing', () => {
    vi.stubEnv('CRON_SECRET', 'test-secret');

    const response = requireCronAuth(new Request('http://localhost/api/internal/cleanup'));

    expect(response?.status).toBe(401);
  });

  it('returns 401 when the token is wrong but the same length as the expected header', () => {
    vi.stubEnv('CRON_SECRET', 'test-secret');

    const response = requireCronAuth(
      new Request('http://localhost/api/internal/cleanup', {
        // Same length as "Bearer test-secret" so this exercises the
        // timingSafeEqual comparison branch, not the length-mismatch branch.
        headers: { authorization: 'Bearer wrong-secre' },
      }),
    );

    expect(response?.status).toBe(401);
  });

  it('returns 401 when the token has a different length than expected', () => {
    vi.stubEnv('CRON_SECRET', 'test-secret');

    const response = requireCronAuth(
      new Request('http://localhost/api/internal/cleanup', {
        headers: { authorization: 'Bearer short' },
      }),
    );

    expect(response?.status).toBe(401);
  });

  it('returns null for a valid bearer token', () => {
    vi.stubEnv('CRON_SECRET', 'test-secret');

    const response = requireCronAuth(
      new Request('http://localhost/api/internal/cleanup', {
        headers: { authorization: 'Bearer test-secret' },
      }),
    );

    expect(response).toBeNull();
  });
});
