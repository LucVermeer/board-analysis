import { createGraphQLClient, type Client } from '@boardsesh/graphql-client';
import { getAuthToken } from '../auth-store';
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

let wsClient: Client | null = null;

export function getWsClient(): Client {
  if (!wsClient) {
    wsClient = createGraphQLClient({
      url: getWsUrl(),
      webSocketImpl: NativeAppWebSocket as unknown as typeof WebSocket,
      connectionParams: async () => {
        const token = await getAuthToken();
        return token ? { authToken: token } : {};
      },
      shouldRetry: (errOrCloseEvent) => {
        if (typeof errOrCloseEvent === 'object' && errOrCloseEvent !== null && 'code' in errOrCloseEvent) {
          return (errOrCloseEvent as { code: number }).code !== 4401;
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
