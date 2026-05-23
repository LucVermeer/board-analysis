import { getAuthToken, getRefreshToken, storeTokens, clearTokens, isTokenExpiringSoon } from './auth-store';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? 'http://localhost:8080';

let refreshPromise: Promise<boolean> | null = null;

async function refreshTokens(): Promise<boolean> {
  const currentRefreshToken = await getRefreshToken();
  if (!currentRefreshToken) return false;

  try {
    const response = await fetch(`${BACKEND_URL}/auth/native/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: currentRefreshToken }),
    });

    if (!response.ok) {
      await clearTokens();
      return false;
    }

    const data = (await response.json()) as { jwt: string; refreshToken: string; expiresAt: string };
    await storeTokens(data.jwt, data.refreshToken, data.expiresAt);
    return true;
  } catch {
    return false;
  }
}

// Deduplicate concurrent refresh attempts
export async function ensureFreshToken(): Promise<boolean> {
  const expiring = await isTokenExpiringSoon();
  if (!expiring) return true;

  if (!refreshPromise) {
    refreshPromise = refreshTokens().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

export async function authenticatedFetch(url: string | URL | Request, options: RequestInit = {}): Promise<Response> {
  await ensureFreshToken();

  const token = await getAuthToken();
  const headers = new Headers(options.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(url, { ...options, headers });

  // If 401, try refresh once then retry (use ensureFreshToken for deduplication)
  if (response.status === 401 && token) {
    const refreshed = await ensureFreshToken();
    if (refreshed) {
      const newToken = await getAuthToken();
      if (newToken) {
        headers.set('Authorization', `Bearer ${newToken}`);
        return fetch(url, { ...options, headers });
      }
    }
    // Refresh failed or no new token — clear stale credentials
    await clearTokens();
  }

  return response;
}
