import { GraphQLClient } from 'graphql-request';
import { authenticatedFetch } from '../auth-interceptor';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? 'http://localhost:8080';

export function getGraphQLHttpUrl(): string {
  return `${BACKEND_URL}/graphql`;
}

export function createGraphQLHttpClient(): GraphQLClient {
  return new GraphQLClient(getGraphQLHttpUrl(), {
    fetch: authenticatedFetch,
  });
}

let httpClient: GraphQLClient | null = null;

export function getHttpClient(): GraphQLClient {
  if (!httpClient) {
    httpClient = createGraphQLHttpClient();
  }
  return httpClient;
}

export function resetHttpClient(): void {
  httpClient = null;
}
