type GraphqlErrorEntry = {
  extensions?: { code?: unknown; status?: unknown };
};

function statusFromGraphqlErrors(errors: unknown): number | null {
  if (!Array.isArray(errors)) return null;
  for (const entry of errors as GraphqlErrorEntry[]) {
    const extensions = entry?.extensions;
    if (extensions && typeof extensions.code === 'number') {
      return extensions.code;
    }
    if (extensions && typeof extensions.status === 'number') {
      return extensions.status;
    }
  }
  return null;
}

export function getErrorStatus(error: unknown): number | null {
  if (error instanceof Response) {
    return error.status;
  }

  if (error && typeof error === 'object') {
    if ('status' in error && typeof (error as Record<string, unknown>).status === 'number') {
      return (error as Record<string, unknown>).status as number;
    }

    if ('response' in error) {
      const response = (error as Record<string, unknown>).response;
      if (response && typeof response === 'object') {
        // HTTP status surfaced under .response.status
        if ('status' in response && typeof (response as Record<string, unknown>).status === 'number') {
          return (response as Record<string, unknown>).status as number;
        }
        // graphql-request's ClientError nests GraphQL errors under .response.errors
        const nestedStatus = statusFromGraphqlErrors((response as Record<string, unknown>).errors);
        if (nestedStatus !== null) {
          return nestedStatus;
        }
      }
    }

    if ('errors' in error) {
      const topLevelStatus = statusFromGraphqlErrors((error as Record<string, unknown>).errors);
      if (topLevelStatus !== null) {
        return topLevelStatus;
      }
    }
  }

  return null;
}

/**
 * A network-reachability failure: the request never reached the server (offline,
 * DNS, connection reset). Surfaced as a TypeError with a network/fetch message by
 * both WinterCG fetch and graphql-request. Distinct from a server that replied with
 * an error status — the drainer treats these two very differently (a network error
 * must never advance retry_count toward the dead-letter).
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) {
    const message = error.message.toLowerCase();
    return message.includes('network') || message.includes('fetch');
  }
  // A cancelled request (app backgrounded mid-drain, AbortController timeout)
  // surfaces as an error NAMED AbortError — not a TypeError, and not reliably a
  // DOMException instance across RN runtimes, so match by name. The request
  // never completed against the server, so replaying is safe; without this
  // branch an aborted write would resolve no status and dead-letter.
  if (error instanceof Error && error.name === 'AbortError') {
    return true;
  }
  return false;
}

export function isRetryable(error: unknown): boolean {
  // Network failures always retry — the request never reached the server, so
  // replaying it is safe.
  if (isNetworkError(error)) {
    return true;
  }

  const status = getErrorStatus(error);

  // No resolvable HTTP/GraphQL status and not a recognized network error: most
  // likely a programmer / validation / parse bug. Dead-letter it (I5) so it's
  // surfaced to the user instead of silently burning the retry budget.
  if (status === null) {
    return false;
  }

  // 401 is retryable because the drainer's fetch is authenticatedFetch
  // (lib/auth-interceptor): it refreshes the token and retries once BEFORE the
  // error reaches classification, and a failed refresh forces sign-out — which
  // wipes the pending queue — so a retried 401 can't loop against a dead session.
  if (status === 401) return true;
  if (status === 429) return true;
  if (status >= 500) return true;

  return false;
}
