// graphql-request throws ClientError-shaped errors carrying response.errors[].
// Surface the first server message when present so backend guidance reaches the
// user verbatim (e.g. "This Instagram post isn't available", "already attached
// to <other climb>", "Instagram is temporarily blocking us"); otherwise return
// null so the caller can fall back to a generic toast string. Never leaks fetch
// internals.
type GraphqlErrorLike = {
  message?: string;
  extensions?: {
    code?: unknown;
    retryAfterSeconds?: unknown;
    [key: string]: unknown;
  } | null;
};

function getGraphqlErrors(error: unknown): GraphqlErrorLike[] {
  if (!error || typeof error !== 'object') return [];
  const response = (error as { response?: { errors?: GraphqlErrorLike[] } }).response;
  if (Array.isArray(response?.errors)) return response.errors;
  const graphqlErrors = (error as { graphqlErrors?: GraphqlErrorLike[] }).graphqlErrors;
  return Array.isArray(graphqlErrors) ? graphqlErrors : [];
}

export function extractGraphqlMessage(error: unknown): string | null {
  const first = getGraphqlErrors(error)[0]?.message;
  if (typeof first === 'string' && first.length > 0) return first;
  return null;
}

export function isGraphqlRateLimitedError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const directExtensions = (error as { extensions?: GraphqlErrorLike['extensions'] }).extensions;
  if (directExtensions?.code === 'RATE_LIMITED') return true;

  return getGraphqlErrors(error).some((graphqlError) => graphqlError.extensions?.code === 'RATE_LIMITED');
}
