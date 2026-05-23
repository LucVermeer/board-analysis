import * as WebBrowser from 'expo-web-browser';
import { storeTokens, clearTokens, getRefreshToken } from './auth-store';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? 'http://localhost:8080';
const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? 'https://www.boardsesh.com';

export type AuthProvider = 'google' | 'apple';

export async function startSignIn(provider: AuthProvider): Promise<void> {
  const callbackUrl = encodeURIComponent('/api/auth/native/callback?next=/');
  const url = `${WEB_URL}/auth/native-start?provider=${provider}&callbackUrl=${callbackUrl}`;
  await WebBrowser.openBrowserAsync(url);
}

export async function exchangeTransferToken(
  transferToken: string,
): Promise<{ success: true; expiresAt: string } | { success: false; error: string }> {
  try {
    const response = await fetch(`${BACKEND_URL}/auth/native/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transferToken }),
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
