import { GraphQLClient } from 'graphql-request';
import { getAuthToken } from '../auth-store';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? 'http://localhost:8080';

export function getGraphQLHttpUrl(): string {
  return `${BACKEND_URL}/graphql`;
}

export function createGraphQLHttpClient(): GraphQLClient {
  return new GraphQLClient(getGraphQLHttpUrl(), {
    requestMiddleware: async (request) => {
      const token = await getAuthToken();
      if (token) {
        return {
          ...request,
          headers: {
            ...request.headers,
            Authorization: `Bearer ${token}`,
          },
        };
      }
      return request;
    },
  });
}

// Singleton client instance
let httpClient: GraphQLClient | null = null;

export function getHttpClient(): GraphQLClient {
  if (!httpClient) {
    httpClient = createGraphQLHttpClient();
  }
  return httpClient;
}

/**
 * Reset the singleton HTTP client (e.g. after sign-out so stale auth
 * headers don't linger).
 */
export function resetHttpClient(): void {
  httpClient = null;
}
