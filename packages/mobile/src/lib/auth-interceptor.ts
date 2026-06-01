import { getAuthToken, getRefreshToken, storeTokens, isTokenExpiringSoon } from './auth-store';
import { signOut } from './auth';
import { BACKEND_URL } from './env';

let refreshPromise: Promise<boolean> | null = null;

async function refreshTokens(): Promise<boolean> {
  const currentRefreshToken = await getRefreshToken();
  if (!currentRefreshToken) return false;

  try {
    const response = await fetch(`${BACKEND_URL}/auth/native/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: currentRefreshToken }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      console.warn(`[Auth] Token refresh failed: HTTP ${response.status}`);
      return false;
    }

    const data = (await response.json()) as { jwt: string; refreshToken: string; expiresAt: string };
    await storeTokens(data.jwt, data.refreshToken, data.expiresAt);
    return true;
  } catch (error) {
    console.warn('[Auth] Token refresh error:', error instanceof Error ? error.message : 'unknown');
    return false;
  }
}

function deduplicatedRefresh(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = refreshTokens().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

export async function ensureFreshToken(): Promise<boolean> {
  const expiring = await isTokenExpiringSoon();
  if (!expiring) return true;
  return deduplicatedRefresh();
}

export async function authenticatedFetch(url: string | URL | Request, options: RequestInit = {}): Promise<Response> {
  await ensureFreshToken();

  const token = await getAuthToken();
  const headers = new Headers(options.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(url, { ...options, headers });

  // On 401, force a refresh regardless of token expiry (server may have
  // revoked the token) and retry once with the new credentials.
  if (response.status === 401 && token) {
    const refreshed = await deduplicatedRefresh();
    if (refreshed) {
      const newToken = await getAuthToken();
      if (newToken) {
        headers.set('Authorization', `Bearer ${newToken}`);
        return fetch(url, { ...options, headers });
      }
    }
    await signOut();
  }

  return response;
}
