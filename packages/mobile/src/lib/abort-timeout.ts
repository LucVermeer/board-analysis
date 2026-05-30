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
