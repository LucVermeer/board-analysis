import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { getRandomBytes, digestStringAsync, CryptoDigestAlgorithm, CryptoEncoding } from 'expo-crypto';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { createTimeoutSignal } from './abort-timeout';
import { storeTokens, clearTokens, getRefreshToken } from './auth-store';
import { BACKEND_URL } from './env';

export type AuthProvider = 'google' | 'apple';

/**
 * Whether the build shipped the Google config the native flow needs, so the
 * login screen can hide the button instead of advertising a sign-in that would
 * fail on tap. Mirrors the app.config.ts plugin gating: the webClientId is
 * always required (it's the idToken audience), and on iOS the reversed-client
 * URL scheme that the google-signin config plugin registers must be present too
 * (an Apple-only build omits it). Android needs no URL scheme.
 */
export function isGoogleSignInConfigured(): boolean {
  if (!process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID) return false;
  // iOS additionally needs the iOS client ID: GoogleSignin.configure reads it
  // for the native flow, and app.config.ts derives the required URL scheme from
  // it. The scheme-only override isn't enough — configure would have no client
  // ID and signIn() would throw. (EXPO_PUBLIC_* are inlined at JS-bundle build
  // time, so an OTA update must be built with the same Google config as the
  // binary it lands on.)
  if (Platform.OS === 'ios') return Boolean(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID);
  return true;
}

type ForwardedName = { firstName?: string; lastName?: string };

type NativeAuthFailure = { success: false; status: number | null; error: string };

// A native OAuth attempt resolves to one of: success, an explicit user
// cancellation (no error shown), or a real failure carrying the server's
// status/error (mapped to a translated message by the caller).
export type OAuthSignInResult = { success: true } | { success: false; cancelled: true } | NativeAuthFailure;

/**
 * POST a verified provider identity token to the backend, which verifies it
 * against the provider's JWKS and returns our mobile JWT pair. Mirrors
 * signInWithCredentials' failure shape so the analytics classifier is reused.
 */
export async function oauthNativeSignIn(
  provider: AuthProvider,
  identityToken: string,
  extra?: { nonce?: string; name?: ForwardedName },
): Promise<OAuthSignInResult> {
  let response: Response;
  try {
    response = await fetch(`${BACKEND_URL}/auth/native/oauth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, identityToken, nonce: extra?.nonce, name: extra?.name }),
      signal: createTimeoutSignal(15_000),
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

// CSPRNG nonce, as lowercase hex. We hand Apple SHA-256(nonce) and send the raw
// value to the backend, which re-hashes to bind the token to this attempt — so
// the raw nonce never lives in the identity token (Apple echoes the request
// nonce verbatim).
function generateNonce(): string {
  const bytes = getRandomBytes(16);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

// expo-apple-authentication rejects with a CodedError whose `.code` is
// `ERR_REQUEST_CANCELED` when the user dismisses the system sheet.
function isAppleCancellation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'ERR_REQUEST_CANCELED';
}

export async function signInWithApple(): Promise<OAuthSignInResult> {
  const rawNonce = generateNonce();
  // Hand Apple the hash; the token's `nonce` claim will be this value (Apple
  // echoes it unmodified). The backend re-hashes the raw nonce we send below.
  const hashedNonce = await digestStringAsync(CryptoDigestAlgorithm.SHA256, rawNonce, {
    encoding: CryptoEncoding.HEX,
  });
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
  } catch (error) {
    if (isAppleCancellation(error)) return { success: false, cancelled: true };
    throw error;
  }

  if (!credential.identityToken) {
    return { success: false, status: null, error: 'no_identity_token' };
  }

  // Apple delivers the name only on the first authorization; forward it when
  // present so a brand-new account gets a display name.
  const fullName = credential.fullName;
  const name: ForwardedName | undefined =
    fullName && (fullName.givenName || fullName.familyName)
      ? { firstName: fullName.givenName ?? undefined, lastName: fullName.familyName ?? undefined }
      : undefined;

  return oauthNativeSignIn('apple', credential.identityToken, { nonce: rawNonce, name });
}

let googleConfigured = false;
function configureGoogleSignin(): void {
  if (googleConfigured) return;
  // webClientId is required to receive an idToken; iosClientId scopes the
  // native flow on iOS. Both are inlined at build time (EXPO_PUBLIC_*).
  GoogleSignin.configure({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  });
  googleConfigured = true;
}

function isGoogleCancellation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === statusCodes.SIGN_IN_CANCELLED
  );
}

export async function signInWithGoogle(): Promise<OAuthSignInResult> {
  configureGoogleSignin();
  try {
    // No-op on iOS; on Android ensures Play Services is present/updatable.
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();
    if (response.type === 'cancelled') {
      return { success: false, cancelled: true };
    }
    const idToken = response.data.idToken;
    if (!idToken) {
      return { success: false, status: null, error: 'no_id_token' };
    }
    return oauthNativeSignIn('google', idToken);
  } catch (error) {
    if (isGoogleCancellation(error)) return { success: false, cancelled: true };
    throw error;
  }
}

export type CredentialsSignInResult = { success: true } | NativeAuthFailure;

export async function signInWithCredentials(email: string, password: string): Promise<CredentialsSignInResult> {
  let response: Response;
  try {
    response = await fetch(`${BACKEND_URL}/auth/native/credentials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      signal: createTimeoutSignal(15_000),
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
