// Pure bucketing for a kiosk's last-seen signal into the four status a gym owner
// cares about. Kept free of `Date.now()`/React so it's unit-testable without
// fake timers: the caller passes the current time in.
//
// Buckets (elapsed = now − lastSeenAt):
//   never  — no signal at all (null / unparseable)
//   live   — < 5 min: a TV checking in on its ~5-minute poll cadence
//   recent — 5 min … 48 h: "last seen X ago" (minutes, then hours)
//   stale  — ≥ 48 h: "no signal for X days" — worth a nudge

export const KIOSK_LIVE_THRESHOLD_MS = 5 * 60 * 1000;
export const KIOSK_STALE_THRESHOLD_MS = 48 * 60 * 60 * 1000;

const MS_PER_MINUTE = 60 * 1000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

export type KioskLiveness =
  | { status: 'never' }
  | { status: 'live' }
  | { status: 'recent'; unit: 'minutes' | 'hours'; count: number }
  | { status: 'stale'; days: number };

/**
 * Bucket a kiosk's last-seen ISO timestamp against `nowMs`. A future timestamp
 * (clock skew between the TV and the server) counts as `live` rather than a
 * negative age. Unparseable or null input is `never`.
 */
export function bucketKioskLiveness(lastSeenAt: string | null, nowMs: number): KioskLiveness {
  if (lastSeenAt === null) return { status: 'never' };

  const lastSeenMs = Date.parse(lastSeenAt);
  if (Number.isNaN(lastSeenMs)) return { status: 'never' };

  const elapsedMs = nowMs - lastSeenMs;
  if (elapsedMs < KIOSK_LIVE_THRESHOLD_MS) return { status: 'live' };

  if (elapsedMs < KIOSK_STALE_THRESHOLD_MS) {
    const minutes = Math.floor(elapsedMs / MS_PER_MINUTE);
    if (minutes < 60) return { status: 'recent', unit: 'minutes', count: minutes };
    return { status: 'recent', unit: 'hours', count: Math.floor(elapsedMs / MS_PER_HOUR) };
  }

  return { status: 'stale', days: Math.floor(elapsedMs / MS_PER_DAY) };
}
