/**
 * Formats an ascent count for compact display.
 * Numbers >= 1000 are shortened with a "k" suffix (e.g. 1500 → "1.5k").
 */
export function formatAscentCount(count: number): string {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k`;
  }
  return String(count);
}
