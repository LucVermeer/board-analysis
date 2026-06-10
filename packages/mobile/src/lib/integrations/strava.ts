import * as WebBrowser from 'expo-web-browser';
import { SHARED_EVENTS } from '@boardsesh/analytics';
import { track } from '../analytics';
import { getAuthToken } from '../auth-store';
import { parseDeepLinkQueryParams } from '../auth-callback-url';
import { BACKEND_URL } from '../env';

export type StravaConnectResult = 'connected' | 'error' | 'cancelled';

const STRAVA_REDIRECT_URL = 'com.boardsesh.app://integrations/strava';

/**
 * Connect the signed-in user's Strava account. Opens the backend OAuth start URL
 * (which redirects through Strava and back to the deep link above) in an auth
 * session browser, then reads the `status` query param off the final redirect.
 *
 * - No auth token → 'error' (can't start an authenticated OAuth flow).
 * - Browser dismissed / cancelled → 'cancelled'.
 * - status=connected → tracks the connection and returns 'connected'.
 * - any other status (including status=error) → 'error'.
 *
 * Never throws — every failure maps to a result the caller can render.
 */
export async function connectStrava(): Promise<StravaConnectResult> {
  const token = await getAuthToken();
  if (!token) return 'error';

  const startUrl = `${BACKEND_URL}/integrations/strava/start?token=${encodeURIComponent(token)}`;

  let result: WebBrowser.WebBrowserAuthSessionResult;
  try {
    result = await WebBrowser.openAuthSessionAsync(startUrl, STRAVA_REDIRECT_URL);
  } catch {
    return 'error';
  }

  if (result.type !== 'success') return 'cancelled';

  const status = readStatusParam(result.url);
  if (status === 'connected') {
    track(SHARED_EVENTS.IntegrationConnected, { integration: 'strava' });
    return 'connected';
  }
  return 'error';
}

/** Extract the `status` query param from the OAuth redirect URL. Returns null
 *  when the URL is unparseable or carries no status. */
function readStatusParam(redirectUrl: string): string | null {
  return parseDeepLinkQueryParams(redirectUrl).get('status') ?? null;
}
