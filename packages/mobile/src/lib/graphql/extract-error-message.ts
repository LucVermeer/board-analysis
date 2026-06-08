// graphql-request throws ClientError-shaped errors carrying response.errors[].
// Surface the first server message when present so backend guidance reaches the
// user verbatim (e.g. "This Instagram post isn't available", "already attached
// to <other climb>", "Instagram is temporarily blocking us"); otherwise return
// null so the caller can fall back to a generic toast string. Never leaks fetch
// internals.
export function extractGraphqlMessage(error: unknown): string | null {
  if (error && typeof error === 'object' && 'response' in error) {
    const response = (error as { response?: { errors?: { message?: string }[] } }).response;
    const first = response?.errors?.[0]?.message;
    if (typeof first === 'string' && first.length > 0) return first;
  }
  return null;
}
