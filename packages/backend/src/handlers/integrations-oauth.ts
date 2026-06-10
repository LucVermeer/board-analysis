// Browser-navigation OAuth endpoints for external-platform integrations.
//
//   GET /integrations/:provider/start?token=<jwt>  → 302 to the provider
//   GET /integrations/:provider/callback           → 302 back into the app
//
// Both are top-level browser navigations from the mobile in-app browser, so
// there is no CORS to apply. The callback always lands the user back in the
// app via a deep link; failures carry a constrained `reason` enum so nothing
// attacker-controllable is reflected verbatim.

import type { IncomingMessage, ServerResponse } from 'http';
import { validateToken } from '../middleware/auth';
import { getProvider, isSupportedProvider, type ProviderName } from '../integrations/registry';
import { signIntegrationState, verifyIntegrationState } from '../integrations/state';
import { upsertCredential } from '../integrations/credentials';
import { logger } from '../utils/logger';

/**
 * Constrained callback failure reasons. The mobile app maps these to copy; an
 * unrecognised provider `error=` param collapses to 'oauth_error' so nothing
 * attacker-controllable reaches the deep link verbatim. Mirrors
 * safeOauthErrorReason in the web kilter callback.
 */
const REFLECTABLE_OAUTH_ERRORS = new Set<string>([
  'access_denied',
  'invalid_request',
  'invalid_scope',
  'server_error',
  'temporarily_unavailable',
  'unauthorized_client',
  'unsupported_response_type',
]);

type CallbackReason =
  | 'oauth_error'
  | 'state_invalid'
  | 'missing_params'
  | 'missing_scope'
  | 'exchange_failed'
  | 'persist_failed';

function safeOauthErrorReason(raw: string): string {
  return REFLECTABLE_OAUTH_ERRORS.has(raw) ? raw : 'oauth_error';
}

function sendText(res: ServerResponse, statusCode: number, message: string): void {
  res.writeHead(statusCode, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
  res.end(message);
}

function redirectTo(res: ServerResponse, location: string): void {
  res.writeHead(302, { Location: location, 'Cache-Control': 'no-store' });
  res.end();
}

function deepLinkBase(provider: ProviderName): string {
  return `com.boardsesh.app://integrations/${provider}`;
}

function redirectSuccess(res: ServerResponse, provider: ProviderName): void {
  redirectTo(res, `${deepLinkBase(provider)}?status=connected`);
}

function redirectError(res: ServerResponse, provider: ProviderName, reason: string): void {
  redirectTo(res, `${deepLinkBase(provider)}?status=error&reason=${encodeURIComponent(reason)}`);
}

/** Public backend origin used to build provider redirect URIs (no trailing slash). */
function getBackendPublicUrl(): string | null {
  const raw = process.env.BACKEND_PUBLIC_URL;
  if (!raw) return null;
  return raw.replace(/\/+$/, '');
}

function extractBearerToken(url: URL): string | null {
  const token = url.searchParams.get('token');
  return token && token.length > 0 ? token : null;
}

/**
 * GET /integrations/:provider/start?token=<jwt>
 * Authenticates the caller, signs a state carrying their userId, and redirects
 * to the provider's authorize URL.
 */
export async function handleIntegrationOAuthStart(
  req: IncomingMessage,
  res: ServerResponse,
  providerName: string,
  url: URL,
): Promise<void> {
  if (!isSupportedProvider(providerName)) {
    sendText(res, 404, 'Unknown integration provider');
    return;
  }
  const provider = getProvider(providerName);
  if (!provider) {
    sendText(res, 404, 'Unknown integration provider');
    return;
  }

  // Never log the token or the full URL — both carry the auth credential.
  const token = extractBearerToken(url);
  if (!token) {
    sendText(res, 401, 'Authentication required');
    return;
  }
  const authResult = await validateToken(token);
  if (!authResult) {
    sendText(res, 401, 'Invalid or expired token');
    return;
  }

  const backendPublicUrl = getBackendPublicUrl();
  if (!backendPublicUrl) {
    logger.error('[Integrations] BACKEND_PUBLIC_URL is not configured; cannot build redirect URI');
    sendText(res, 500, 'Integration is not configured');
    return;
  }

  let authorizeUrl: string;
  try {
    const redirectUri = `${backendPublicUrl}/integrations/${providerName}/callback`;
    const state = signIntegrationState({ userId: authResult.userId, provider: providerName });
    authorizeUrl = provider.buildAuthorizeUrl(state, redirectUri);
  } catch (error) {
    logger.error('[Integrations] Failed to build authorize URL:', error);
    sendText(res, 500, 'Integration is not configured');
    return;
  }

  redirectTo(res, authorizeUrl);
}

/**
 * GET /integrations/:provider/callback
 * Provider redirect target. Verifies state, exchanges the code, persists
 * encrypted tokens, and redirects back into the app via deep link.
 */
export async function handleIntegrationOAuthCallback(
  req: IncomingMessage,
  res: ServerResponse,
  providerName: string,
  url: URL,
): Promise<void> {
  if (!isSupportedProvider(providerName)) {
    sendText(res, 404, 'Unknown integration provider');
    return;
  }
  const provider = getProvider(providerName);
  if (!provider) {
    sendText(res, 404, 'Unknown integration provider');
    return;
  }
  // Provider name is validated; the deep link uses the narrowed type.
  const providerDbName: ProviderName = providerName;

  // Provider-reported error (e.g. the user declined authorization).
  const providerError = url.searchParams.get('error');
  if (providerError) {
    redirectError(res, providerDbName, safeOauthErrorReason(providerError));
    return;
  }

  const state = url.searchParams.get('state');
  const verifiedState = state ? verifyIntegrationState(state) : null;
  if (!verifiedState || verifiedState.provider !== providerDbName) {
    redirectError(res, providerDbName, 'state_invalid' satisfies CallbackReason);
    return;
  }

  const code = url.searchParams.get('code');
  if (!code) {
    redirectError(res, providerDbName, 'missing_params' satisfies CallbackReason);
    return;
  }

  // Strava returns the granted scope on the callback. Require activity:write —
  // a read-only grant cannot upload activities, so fail early with clear copy
  // rather than at the first upload.
  const grantedScope = url.searchParams.get('scope') ?? '';
  if (!grantedScope.split(',').includes('activity:write')) {
    redirectError(res, providerDbName, 'missing_scope' satisfies CallbackReason);
    return;
  }

  const redirectUri = `${getBackendPublicUrl() ?? ''}/integrations/${providerName}/callback`;

  let tokens;
  try {
    tokens = await provider.exchangeCode(code, redirectUri);
  } catch (error) {
    logger.error('[Integrations] Code exchange failed:', error);
    redirectError(res, providerDbName, 'exchange_failed' satisfies CallbackReason);
    return;
  }

  try {
    await upsertCredential(verifiedState.userId, providerDbName, tokens);
  } catch (error) {
    logger.error('[Integrations] Credential persistence failed:', error);
    redirectError(res, providerDbName, 'persist_failed' satisfies CallbackReason);
    return;
  }

  redirectSuccess(res, providerDbName);
}
