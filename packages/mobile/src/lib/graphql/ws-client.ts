import { createGraphQLClient, type Client } from '@boardsesh/graphql-client';
import { getAuthToken } from '../auth-store';
import { deduplicatedRefresh, ensureFreshToken } from '../auth-interceptor';
import { BACKEND_URL } from '../env';

function getWsUrl(): string {
  const wsUrl = process.env.EXPO_PUBLIC_WS_URL;
  if (wsUrl) return wsUrl;

  return BACKEND_URL.replace(/^http(s?):\/\//, 'ws$1://') + '/graphql';
}

// React Native's WebSocket derives an `Origin` header from the JS bundle
// URL (e.g. `http://localhost:8084` in dev). The backend's `verifyClient`
// (packages/backend/src/handlers/cors.ts:140-149) rejects any Origin not
// on the allowlist with HTTP 403, killing the upgrade before any GraphQL
// op can run. The same handler intentionally allows requests with no
// Origin header so native apps can connect — RN just doesn't take that
// branch by default. Pass an empty `origin` via RN's 3rd-arg options to
// drop the header. The DOM `WebSocket` type doesn't expose this arg, so
// cast through a local alias.
type RNWebSocketCtor = new (
  url: string | URL,
  protocols?: string | string[],
  options?: { headers?: Record<string, string> },
) => WebSocket;

class NativeAppWebSocket extends (WebSocket as unknown as RNWebSocketCtor) {
  constructor(url: string | URL, protocols?: string | string[]) {
    super(url, protocols, { headers: { origin: '' } });
  }
}

// The backend closes the socket with 4401 when it rejects our auth token —
// expired, or revoked server-side while still within its lifetime.
const AUTH_REJECTED_CLOSE_CODE = 4401;

function isAuthRejectedClose(errOrCloseEvent: unknown): boolean {
  return (
    typeof errOrCloseEvent === 'object' &&
    errOrCloseEvent !== null &&
    'code' in errOrCloseEvent &&
    (errOrCloseEvent as { code: number }).code === AUTH_REJECTED_CLOSE_CODE
  );
}

let wsClient: Client | null = null;

// Guards the refresh-and-recreate so a burst of 4401 closes (one per active
// subscription) triggers a single token refresh and a single client teardown,
// not a reconnect storm. Reset once the cycle settles so a later, genuinely new
// auth failure can refresh again.
let handlingAuthRejection = false;

// Mirror of the HTTP path's 401 branch (auth-interceptor.authenticatedFetch):
// force a refresh, then drop the client so the next getWsClient() rebuilds one
// whose connectionParams read the new token. We force the refresh via
// deduplicatedRefresh rather than ensureFreshToken because the server may have
// revoked a token that hasn't expired yet — the expiry check would skip the
// refresh and we'd reconnect with the same dead token. A failed refresh (the
// refresh token is gone too) is left to the HTTP 401 path, which drives the
// single forced sign-out; duplicating it here would double-revoke.
async function refreshAuthAndRecreateClient(): Promise<void> {
  if (handlingAuthRejection) return;
  handlingAuthRejection = true;
  try {
    await deduplicatedRefresh();
  } finally {
    disposeWsClient();
    handlingAuthRejection = false;
  }
}

export function getWsClient(): Client {
  if (!wsClient) {
    wsClient = createGraphQLClient({
      url: getWsUrl(),
      webSocketImpl: NativeAppWebSocket as unknown as typeof WebSocket,
      connectionParams: async () => {
        // Refresh a soon-to-expire token before the handshake, matching the
        // HTTP path's up-front ensureFreshToken() in authenticatedFetch.
        await ensureFreshToken();
        const token = await getAuthToken();
        return token ? { authToken: token } : {};
      },
      shouldRetry: (errOrCloseEvent) => {
        if (isAuthRejectedClose(errOrCloseEvent)) {
          // Don't let graphql-ws retry the doomed connection with the same
          // token. Refresh + drop the client so the next subscription rebuilds
          // a fresh client and reconnects with a valid token.
          void refreshAuthAndRecreateClient();
          return false;
        }
        return true;
      },
    });
  }
  return wsClient;
}

export function disposeWsClient(): void {
  if (wsClient) {
    wsClient.dispose();
    wsClient = null;
  }
}
