import { formatTickRelativeTime, tickTimeMs } from '@boardsesh/profile-stats';

// Formatting helpers for the Open Drafts list, shared by the inline drafts
// section in the create drawer (and any other draft list surface).

// Count painted holds in an Aurora frames string (`p{id}r{code}` per hold).
export function countHolds(frames: string | null | undefined): number {
  const matches = frames?.match(/p\d+r\d+/g);
  return matches ? matches.length : 0;
}

// Relative "saved X ago" label. Delegates to the dayjs-based helper used by
// the logbook/feed surfaces — Hermes ships an incomplete Intl, so
// Intl.RelativeTimeFormat is unavailable on device and must not be used here.
export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return '';
  if (!Number.isFinite(tickTimeMs(iso))) return '';
  return formatTickRelativeTime(iso);
}
