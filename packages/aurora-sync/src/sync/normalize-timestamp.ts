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
 * Already-qualified strings (carrying `T`, `Z`, or a trailing ±hh:mm / ±hhmm
 * offset after the time component) are passed through `new Date(...)`
 * unchanged in meaning. Aurora has never been observed to emit an explicit
 * offset on the space-separated form, but the function is safe if it ever
 * does: "2024-01-15 10:30:00+05:30" is treated as already-zoned (separator
 * fixed, no Z appended), not relabelled as UTC.
 */

/**
 * A UTC-offset suffix at the END of the string: ±hh:mm or ±hhmm. Anchored so
 * the date part's hyphens can't false-positive — "2024-01-15" ends in "-15",
 * which is only two digits after the sign, never four (or dd:dd).
 */
const TRAILING_OFFSET_SUFFIX = /[+-]\d{2}:?\d{2}$/;

export function normalizeTimestamp(ts: string): string {
  let normalized = ts.trim();
  // Space-separated form (no 'T'/'Z' anywhere).
  if (!normalized.includes('T') && !normalized.includes('Z')) {
    if (TRAILING_OFFSET_SUFFIX.test(normalized)) {
      // Already zoned — DON'T relabel as UTC. Truncate microseconds (they sit
      // before the offset), normalise a compact ±hhmm to ±hh:mm so the ISO
      // parser accepts it, and fix the separator.
      normalized = normalized
        .replace(/(\.\d{3})\d*(?=[+-]\d{2}:?\d{2}$)/, '$1')
        .replace(/([+-]\d{2})(\d{2})$/, '$1:$2')
        .replace(' ', 'T');
    } else {
      // Naive — Aurora's naive strings are UTC. Truncate microseconds
      // (.000001) to milliseconds (.000) and pin to UTC.
      normalized = normalized.replace(/(\.\d{3})\d*$/, '$1');
      normalized = normalized.replace(' ', 'T') + 'Z';
    }
  }
  return new Date(normalized).toISOString();
}
