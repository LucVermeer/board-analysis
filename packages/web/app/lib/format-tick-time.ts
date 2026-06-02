// Tick-time parsing/formatting lives in @boardsesh/profile-stats so mobile and
// web share one source of truth (these helpers recover the absolute moment from
// the naive `boardsesh_ticks.climbed_at` timestamps via dayjs.utc). Re-exported
// here for back-compat with web call sites that import '@/app/lib/format-tick-time'.
export { parseTickTime, formatTickRelativeTime, formatTickAbsoluteTime, tickTimeMs } from '@boardsesh/profile-stats';
