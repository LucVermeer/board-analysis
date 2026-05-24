/** Format a count compactly: <1000 as-is, 1k–999k compact, ≥1m with decimal + m */
export function formatCount(count: number): string {
  if (count >= 1_000_000) {
    const millions = count / 1_000_000;
    const fixed = millions.toFixed(1);
    return `${fixed.endsWith('.0') ? fixed.slice(0, -2) : fixed}m`;
  }
  if (count < 1000) return `${count}`;
  const thousands = count / 1000;
  if (thousands < 10) {
    const fixed = thousands.toFixed(1);
    return `${fixed.endsWith('.0') ? fixed.slice(0, -2) : fixed}k`;
  }
  return `${Math.round(thousands)}k`;
}

/** Format send count with singular/plural label: "1 send", "5 sends", "1.2k sends" */
export function formatSends(count: number): string {
  return `${formatCount(count)} send${count === 1 ? '' : 's'}`;
}

/** Round quality_average to 1 decimal place */
export function formatQuality(quality: string): string {
  const n = parseFloat(quality);
  if (Number.isNaN(n)) return quality;
  return n.toFixed(1);
}
