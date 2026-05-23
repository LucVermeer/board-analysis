import { createClient, type Client } from 'graphql-ws';
import { getAuthToken } from '../auth-store';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? 'http://localhost:8080';

function getWsUrl(): string {
  // Convert http(s) to ws(s), or use as-is if already ws
  const wsUrl = process.env.EXPO_PUBLIC_WS_URL;
  if (wsUrl) return wsUrl;

  return BACKEND_URL.replace(/^http(s?):\/\//, 'ws$1://') + '/graphql';
}

let wsClient: Client | null = null;

export function getWsClient(): Client {
  if (!wsClient) {
    wsClient = createClient({
      url: getWsUrl(),
      connectionParams: async () => {
        const token = await getAuthToken();
        return token ? { authToken: token } : {};
      },
      lazy: true,
      retryAttempts: 10,
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
