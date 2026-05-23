import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

// ── Mock expo-secure-store ──────────────────────────────────────────────
// auth-store imports expo-secure-store, which doesn't exist in Node.
vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn().mockResolvedValue(null),
  setItemAsync: vi.fn().mockResolvedValue(undefined),
  deleteItemAsync: vi.fn().mockResolvedValue(undefined),
}));

// ── Mock auth-store for interceptor-level tests ─────────────────────────
vi.mock('../auth-store', () => ({
  getAuthToken: vi.fn().mockResolvedValue('test-jwt'),
  getRefreshToken: vi.fn().mockResolvedValue('test-refresh-token'),
  storeTokens: vi.fn().mockResolvedValue(undefined),
  clearTokens: vi.fn().mockResolvedValue(undefined),
  isTokenExpiringSoon: vi.fn().mockResolvedValue(false),
  getTokenExpiresAt: vi.fn().mockResolvedValue(null),
}));

import { ensureFreshToken, authenticatedFetch } from '../auth-interceptor';
import { getAuthToken, getRefreshToken, storeTokens, clearTokens, isTokenExpiringSoon } from '../auth-store';

const mockIsTokenExpiringSoon = isTokenExpiringSoon as Mock;
const mockGetAuthToken = getAuthToken as Mock;
const mockGetRefreshToken = getRefreshToken as Mock;
const mockStoreTokens = storeTokens as Mock;
const mockClearTokens = clearTokens as Mock;

// ── Global fetch mock ────────────────────────────────────────────────────
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAuthToken.mockResolvedValue('test-jwt');
  mockGetRefreshToken.mockResolvedValue('test-refresh-token');
  mockIsTokenExpiringSoon.mockResolvedValue(false);
});

// ── ensureFreshToken ─────────────────────────────────────────────────────

describe('ensureFreshToken', () => {
  it('skips refresh when token is not expiring', async () => {
    mockIsTokenExpiringSoon.mockResolvedValue(false);

    const result = await ensureFreshToken();

    expect(result).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockStoreTokens).not.toHaveBeenCalled();
  });

  it('triggers refresh when token is expiring', async () => {
    mockIsTokenExpiringSoon.mockResolvedValue(true);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          jwt: 'new-jwt',
          refreshToken: 'new-refresh',
          expiresAt: '2099-01-01T00:00:00Z',
        }),
    });

    const result = await ensureFreshToken();

    expect(result).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/native/refresh'),
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: 'test-refresh-token' }),
      }),
    );
    expect(mockStoreTokens).toHaveBeenCalledWith('new-jwt', 'new-refresh', '2099-01-01T00:00:00Z');
  });

  it('deduplicates concurrent refresh calls', async () => {
    mockIsTokenExpiringSoon.mockResolvedValue(true);
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          jwt: 'new-jwt',
          refreshToken: 'new-refresh',
          expiresAt: '2099-01-01T00:00:00Z',
        }),
    });

    const [resultA, resultB, resultC] = await Promise.all([ensureFreshToken(), ensureFreshToken(), ensureFreshToken()]);

    expect(resultA).toBe(true);
    expect(resultB).toBe(true);
    expect(resultC).toBe(true);
    // Only one actual fetch despite three concurrent calls
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

// ── authenticatedFetch ───────────────────────────────────────────────────

describe('authenticatedFetch', () => {
  it('retries with new token on 401 even when token is not expiring', async () => {
    // Token is NOT expiring — the 401 path should bypass the expiry check
    mockIsTokenExpiringSoon.mockResolvedValue(false);
    mockGetAuthToken
      .mockResolvedValueOnce('old-jwt') // first call before initial request
      .mockResolvedValueOnce('new-jwt') // after refresh, for the retry
      .mockResolvedValue('new-jwt');

    // First request returns 401
    mockFetch.mockResolvedValueOnce({
      status: 401,
      ok: false,
    });
    // Refresh endpoint succeeds
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          jwt: 'new-jwt',
          refreshToken: 'new-refresh',
          expiresAt: '2099-01-01T00:00:00Z',
        }),
    });
    // Retried request succeeds
    mockFetch.mockResolvedValueOnce({
      status: 200,
      ok: true,
    });

    const response = await authenticatedFetch('https://api.example.com/data');

    expect(response.status).toBe(200);
    // 3 fetches: original request, refresh, retry
    expect(mockFetch).toHaveBeenCalledTimes(3);

    // Verify the retry used the new token
    const retryCall = mockFetch.mock.calls[2];
    const retryHeaders = retryCall[1].headers as Headers;
    expect(retryHeaders.get('Authorization')).toBe('Bearer new-jwt');
  });

  it('clears tokens when 401 retry refresh fails', async () => {
    mockIsTokenExpiringSoon.mockResolvedValue(false);
    mockGetAuthToken.mockResolvedValue('old-jwt');

    // Initial request returns 401
    mockFetch.mockResolvedValueOnce({
      status: 401,
      ok: false,
    });
    // Refresh endpoint fails
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
    });

    const response = await authenticatedFetch('https://api.example.com/data');

    expect(response.status).toBe(401);
    expect(mockClearTokens).toHaveBeenCalledTimes(1);
    // clearTokens called once in the 401 handler after refresh fails
  });

  it('attaches Authorization header from stored token', async () => {
    mockIsTokenExpiringSoon.mockResolvedValue(false);
    mockGetAuthToken.mockResolvedValue('my-jwt-token');
    mockFetch.mockResolvedValueOnce({ status: 200, ok: true });

    await authenticatedFetch('https://api.example.com/data', {
      headers: { 'X-Custom': 'value' },
    });

    const fetchCall = mockFetch.mock.calls[0];
    const headers = fetchCall[1].headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer my-jwt-token');
    expect(headers.get('X-Custom')).toBe('value');
  });
});

// ── isTokenExpiringSoon (boundary conditions) ────────────────────────────
// The auth-store module is mocked for the interceptor tests above.
// For boundary tests we need the real implementation, so we use
// vi.importActual to bypass the mock and drive it through the
// SecureStore mock layer.

describe('isTokenExpiringSoon boundary conditions', () => {
  it('returns false when token expires in 25 hours', async () => {
    const realAuthStore = await vi.importActual<typeof import('../auth-store')>('../auth-store');
    const SecureStore = await import('expo-secure-store');
    const futureDate = new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString();
    (SecureStore.getItemAsync as Mock).mockResolvedValueOnce(futureDate);

    const result = await realAuthStore.isTokenExpiringSoon();

    expect(result).toBe(false);
  });

  it('returns true when token expires in 23 hours', async () => {
    const realAuthStore = await vi.importActual<typeof import('../auth-store')>('../auth-store');
    const SecureStore = await import('expo-secure-store');
    const futureDate = new Date(Date.now() + 23 * 60 * 60 * 1000).toISOString();
    (SecureStore.getItemAsync as Mock).mockResolvedValueOnce(futureDate);

    const result = await realAuthStore.isTokenExpiringSoon();

    expect(result).toBe(true);
  });

  it('returns true when no expiry is stored', async () => {
    const realAuthStore = await vi.importActual<typeof import('../auth-store')>('../auth-store');
    const SecureStore = await import('expo-secure-store');
    (SecureStore.getItemAsync as Mock).mockResolvedValueOnce(null);

    const result = await realAuthStore.isTokenExpiringSoon();

    expect(result).toBe(true);
  });
});
