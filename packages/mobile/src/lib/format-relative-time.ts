// Locale-aware "5 minutes ago"-style formatting for ISO timestamps, shared by
// any surface that shows recency (draft lists, the BLE device picker's
// last-connected subtitle, ...). Lives in lib/ so feature modules don't have
// to import each other for it.
export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return '';
  const seconds = Math.round((Date.now() - then) / 1000);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  if (seconds < 60) return formatter.format(-seconds, 'second');
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return formatter.format(-minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (hours < 24) return formatter.format(-hours, 'hour');
  const days = Math.round(hours / 24);
  if (days < 30) return formatter.format(-days, 'day');
  const months = Math.round(days / 30);
  if (months < 12) return formatter.format(-months, 'month');
  return formatter.format(-Math.round(months / 12), 'year');
}
