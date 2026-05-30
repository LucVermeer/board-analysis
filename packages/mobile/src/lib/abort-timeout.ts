// Hermes on RN 0.85 supports AbortSignal.timeout, but a future RN baseline
// or any alternate runtime without it would make every fetch in this file
// throw silently (the swallowing catch blocks turn that into "no servers
// found" with no log). Using AbortController + setTimeout keeps the same
// shape on every JS runtime.
export function createTimeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  controller.signal.addEventListener('abort', () => clearTimeout(timer), { once: true });
  return controller.signal;
}

// Returns a signal that aborts as soon as any of the source signals abort.
// `AbortSignal.any` exists on modern runtimes but not on every Hermes pin —
// reimplement to stay portable.
export function combineAbortSignals(...signals: (AbortSignal | undefined)[]): AbortSignal {
  const controller = new AbortController();
  for (const signal of signals) {
    if (!signal) continue;
    if (signal.aborted) {
      controller.abort(signal.reason);
      return controller.signal;
    }
    signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
  }
  return controller.signal;
}

// Maps `items` through `fn` with at most `concurrency` calls in flight at a
// time. Preserves input order in the returned array. Used to keep the Metro
// discovery scan from saturating the network stack on multi-host tailnets.
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await fn(items[index]);
    }
  }

  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, worker);
  await Promise.all(workers);
  return results;
}
