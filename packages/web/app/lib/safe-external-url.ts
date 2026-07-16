/**
 * Render-side guard for externally-sourced hrefs (gym websites, user links).
 *
 * The backend's GymWebsiteSchema already rejects non-http(s) schemes at write
 * time, but rows written before that schema existed — or through any future
 * ingest path that skips GraphQL validation — could still hold arbitrary
 * strings. A `javascript:` URI in an href is a clickable XSS vector that
 * `rel="noopener"` does not block, so every externally-sourced href must pass
 * through here before rendering.
 */

/**
 * Returns the URL when it parses with an http/https protocol, else null
 * (callers skip rendering the link entirely). The original string is returned
 * rather than URL#href so display text derived from it stays unchanged.
 */
export function safeExternalHref(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return null;
  }
  return raw;
}
