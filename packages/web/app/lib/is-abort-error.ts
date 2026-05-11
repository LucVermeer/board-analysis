/**
 * Recognise the "request was aborted" exit path so callers can swallow it
 * silently. Page navigation in modern browsers aborts in-flight fetches; the
 * resulting rejection is not a real error and shouldn't surface as a snackbar
 * or unhandled rejection (see Sentry BOARDSESH-1F).
 *
 * Accepts both `Error` and `DOMException` (the latter doesn't always extend
 * Error — modern browsers and Node 17+ have it inheriting from Error, but
 * jsdom and older WebKit don't). Walks the `cause` chain so wrapped errors
 * are recognised — graphql-request and similar HTTP libraries re-throw with
 * the underlying DOMException on `.cause`. The walk is bounded to avoid
 * pathological cycles.
 */
function isErrorLike(value: unknown): value is { name: string; cause?: unknown } {
  if (value instanceof Error) return true;
  if (typeof DOMException !== 'undefined' && value instanceof DOMException) return true;
  return false;
}

export function isAbortError(error: unknown): boolean {
  const MAX_DEPTH = 5;
  let current: unknown = error;
  for (let depth = 0; depth < MAX_DEPTH; depth += 1) {
    if (!isErrorLike(current)) return false;
    if (current.name === 'AbortError') return true;
    const next: unknown = current.cause;
    if (next === current || next === undefined || next === null) return false;
    current = next;
  }
  return false;
}
