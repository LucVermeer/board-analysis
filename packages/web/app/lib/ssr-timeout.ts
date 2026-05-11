import 'server-only';

// Cap cold-path SSR at this budget; on timeout, fall back to client-side fetch.
export const SSR_FETCH_TIMEOUT_MS = 5_000;

export function withSsrTimeout<T>(promise: Promise<T>, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), SSR_FETCH_TIMEOUT_MS);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}
