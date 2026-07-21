/**
 * Fire-and-forget cache priming issued the instant a user taps Share — seconds
 * before a crawler scrapes the freshly shared URL. Warms two cold caches so the
 * crawler's fetches land as warm hits:
 *   - the share page HTML on the Vercel CDN (same-origin GET; the first crawler
 *     hit would otherwise pay a full cold-lambda SSR)
 *   - the backend og:image caches (cross-origin to ws.boardsesh.com; `no-cors`
 *     so an opaque response resolves instead of throwing)
 *
 * Best-effort only: every fetch is voided (never awaited) and all failures are
 * swallowed, so priming can never delay or break the share flow.
 *
 * Known gap: for a sharer with a non-default locale cookie, the page fetch
 * follows the sticky-locale 307 and warms the /es|/fr CDN entry rather than the
 * unprefixed URL crawlers fetch — a harmless no-op (never a wrong cache entry;
 * the redirect returns before cache headers attach). The og warm is
 * locale-independent and works for everyone.
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
    const response = isCrossOrigin ? await fetch(url, { mode: 'no-cors' }) : await fetch(url);
    await response.body?.cancel();
  } catch {
    // Swallow — priming is best-effort and must not surface to the user.
  }
}
