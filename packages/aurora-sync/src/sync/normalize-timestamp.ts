/**
 * Normalize an Aurora timestamp to ISO-8601 UTC.
 *
 * Aurora returns naive timestamps as "2024-01-15 10:30:00" (space separator,
 * no timezone indicator). Those naive strings are UTC — but the space form has
 * no `Z`, so `new Date("2024-01-15 10:30:00")` makes V8 parse it as
 * SERVER-LOCAL time and shift the instant by the deployment's UTC offset. Every
 * write path (JSON import AND the live Aurora pull) must funnel timestamps
 * through here so a naive value is pinned to UTC and every source agrees on the
 * same instant for the same ascent — which is what lets the cross-source
 * natural-key dedup line up (JSON-imported vs live-pulled vs Kilter-pulled).
 *
 * Already-qualified strings (carrying `T`, `Z`, or an offset) are passed
 * through `new Date(...)` unchanged in meaning.
 */
export function normalizeTimestamp(ts: string): string {
  let normalized = ts.trim();
  // If the string has no timezone indicator (T/Z/+/-), treat as UTC
  // by replacing the space separator with 'T' and appending 'Z'
  if (!normalized.includes('T') && !normalized.includes('Z')) {
    // Truncate microseconds (.000001) to milliseconds (.000) for consistency
    normalized = normalized.replace(/(\.\d{3})\d*$/, '$1');
    normalized = normalized.replace(' ', 'T') + 'Z';
  }
  return new Date(normalized).toISOString();
}
