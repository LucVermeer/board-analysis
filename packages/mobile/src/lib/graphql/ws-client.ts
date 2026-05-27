import { createGraphQLClient, type Client } from '@boardsesh/graphql-client';
import { getAuthToken } from '../auth-store';
import { BACKEND_URL } from '../env';

function getWsUrl(): string {
  const wsUrl = process.env.EXPO_PUBLIC_WS_URL;
  if (wsUrl) return wsUrl;

  return BACKEND_URL.replace(/^http(s?):\/\//, 'ws$1://') + '/graphql';
}

let wsClient: Client | null = null;

export function getWsClient(): Client {
  if (!wsClient) {
    wsClient = createGraphQLClient({
      url: getWsUrl(),
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
