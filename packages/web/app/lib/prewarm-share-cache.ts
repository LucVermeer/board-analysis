/**
 * Fire-and-forget cache priming on Share tap: warms the share page on the
 * Vercel CDN and the backend og:image caches seconds before a crawler scrapes.
 * Best-effort — voided, all failures swallowed, never delays the share flow.
 * (Non-default-locale sharers' page fetch follows the sticky-locale 307 and
 * warms the prefixed entry instead — a harmless no-op, never a wrong entry.)
 */
export function prewarmShareCaches(urls: string[]): void {
  if (typeof window === 'undefined') return;
  for (const url of urls) {
    void primeShareTarget(url);
  }
}

async function primeShareTarget(url: string): Promise<void> {
  try {
    const isCrossOrigin = new URL(url, window.location.href).origin !== window.location.origin;
    // Cross-origin (backend og image): no-cors so an opaque response resolves
    // instead of throwing. Same-origin (share page): a plain GET that lands in
    // the CDN cache. Either way the body is discarded.
    if (isCrossOrigin) {
      // no-cors: opaque response, nothing to read or cancel.
      await fetch(url, { mode: 'no-cors' });
      return;
    }
    const response = await fetch(url);
    await response.body?.cancel();
  } catch {
    // Swallow — priming is best-effort and must not surface to the user.
  }
}
