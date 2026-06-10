import { formatTickRelativeTime, tickTimeMs } from '@boardsesh/profile-stats';

// Locale-aware "5 minutes ago"-style formatting for ISO timestamps, shared by
// any surface that shows recency (draft lists, the BLE device picker's
// last-connected subtitle, ...). Lives in lib/ so feature modules don't have
// to import each other for it.
//
// Delegates to the dayjs-based helper in @boardsesh/profile-stats (also used by
// the logbook/feed surfaces). It must NOT use Intl.RelativeTimeFormat: Hermes
// ships an incomplete Intl without it, so constructing one throws a TypeError
// that release builds promote to a native crash — Node-based tests never see it.
export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return '';
  // formatTickRelativeTime throws on empty input and renders "Invalid Date" for
  // unparseable strings, so validate first to keep the empty-string contract.
  if (!Number.isFinite(tickTimeMs(iso))) return '';
  return formatTickRelativeTime(iso);
}
