import dayjs, { type Dayjs } from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import utc from 'dayjs/plugin/utc';

dayjs.extend(relativeTime);
dayjs.extend(utc);

function requireString(climbedAt: string): string {
  // dayjs.utc(undefined) silently returns "now", which would corrupt sorts and
  // bucket bounds. The signatures already require `string`, but we guard at
  // runtime so a stray `?.` or future caller can't bypass the type system.
  if (!climbedAt) {
    throw new TypeError('format-tick-time helpers require a non-empty timestamp string');
  }
  return climbedAt;
}

// `boardsesh_ticks.climbed_at` (and `created_at` / `updated_at`) are naive
// `timestamp` columns. Drizzle returns them as strings with no `Z` suffix,
// so any `dayjs(<naiveString>)` call would parse them as browser-local time.
// These helpers parse through `dayjs.utc(...)` to recover the absolute moment
// before any rendering, sorting, or bucketing.

export function parseTickTime(climbedAt: string): Dayjs {
  return dayjs.utc(requireString(climbedAt)).local();
}

export function formatTickRelativeTime(climbedAt: string): string {
  return dayjs.utc(requireString(climbedAt)).fromNow();
}

export function formatTickAbsoluteTime(climbedAt: string, format: string): string {
  return parseTickTime(climbedAt).format(format);
}

export function tickTimeMs(climbedAt: string): number {
  return dayjs.utc(requireString(climbedAt)).valueOf();
}
