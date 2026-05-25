import { GraphQLClient } from 'graphql-request';
import { authenticatedFetch } from '../auth-interceptor';
import { BACKEND_URL } from '../env';

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
