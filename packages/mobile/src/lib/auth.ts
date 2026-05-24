import * as WebBrowser from 'expo-web-browser';
import { storeTokens, clearTokens, getRefreshToken } from './auth-store';
import { WEB_BASE_URL } from './env';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? 'http://localhost:8080';

export type AuthProvider = 'google' | 'apple';

export async function startSignIn(provider: AuthProvider): Promise<void> {
  const callbackUrl = encodeURIComponent('/api/auth/native/callback?next=/');
  const url = `${WEB_BASE_URL}/auth/native-start?provider=${provider}&callbackUrl=${callbackUrl}`;
  await WebBrowser.openAuthSessionAsync(url, 'com.boardsesh.app://auth/callback');
}

export async function exchangeTransferToken(
  transferToken: string,
): Promise<{ success: true; expiresAt: string } | { success: false; error: string }> {
  try {
    const response = await fetch(`${BACKEND_URL}/auth/native/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transferToken }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      return { success: false, error: errorBody || `HTTP ${response.status}` };
    }

    const data = (await response.json()) as { jwt: string; refreshToken: string; expiresAt: string };
    await storeTokens(data.jwt, data.refreshToken, data.expiresAt);
    return { success: true, expiresAt: data.expiresAt };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Exchange failed' };
  }
}

export type CredentialsSignInResult = { success: true } | { success: false; status: number | null; error: string };

export async function signInWithCredentials(email: string, password: string): Promise<CredentialsSignInResult> {
  let response: Response;
  try {
    response = await fetch(`${BACKEND_URL}/auth/native/credentials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    // Network failure / timeout. The caller maps this to a translated message.
    return { success: false, status: null, error: 'network' };
  }

  if (!response.ok) {
    let serverError = `HTTP ${response.status}`;
    try {
      const parsed = (await response.json()) as { error?: unknown };
      if (typeof parsed.error === 'string' && parsed.error.length > 0) {
        serverError = parsed.error;
      }
    } catch {
      // Body wasn't JSON; fall back to the HTTP status string above.
    }
    return { success: false, status: response.status, error: serverError };
  }

  const data = (await response.json()) as { jwt: string; refreshToken: string; expiresAt: string };
  await storeTokens(data.jwt, data.refreshToken, data.expiresAt);
  return { success: true };
}

export async function signOut(): Promise<void> {
  const refreshToken = await getRefreshToken();
  if (refreshToken) {
    // Best-effort server-side revocation — don't block on failure
    fetch(`${BACKEND_URL}/auth/native/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    }).catch(() => {});
  }
  await clearTokens();
}
