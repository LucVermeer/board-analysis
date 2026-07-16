import { describe, it, expect } from 'vitest';
import { KIOSK_HEARTBEAT_INTERVAL_MS } from '@boardsesh/kiosk';
import { bucketKioskLiveness, KIOSK_LIVE_THRESHOLD_MS, KIOSK_STALE_THRESHOLD_MS } from '../kiosk-liveness';

const NOW = Date.parse('2026-07-16T12:00:00.000Z');
const at = (msAgo: number): string => new Date(NOW - msAgo).toISOString();

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('bucketKioskLiveness', () => {
  it('reports "never" for a null / unparseable signal', () => {
    expect(bucketKioskLiveness(null, NOW)).toEqual({ status: 'never' });
    expect(bucketKioskLiveness('not-a-date', NOW)).toEqual({ status: 'never' });
  });

  it('reports "live" under the threshold, including a skewed future time', () => {
    expect(bucketKioskLiveness(at(0), NOW)).toEqual({ status: 'live' });
    expect(bucketKioskLiveness(at(KIOSK_LIVE_THRESHOLD_MS - 1), NOW)).toEqual({ status: 'live' });
    // Clock skew: the TV's timestamp is slightly in the future.
    expect(bucketKioskLiveness(at(-30 * 1000), NOW)).toEqual({ status: 'live' });
  });

  it('stays "live" across a single missed poll — the window is 2x the cadence', () => {
    // Anti-flap: a healthy TV's write-to-write gap is one cadence, and one
    // late/dropped poll (just over a cadence) must not flip it to "recent".
    expect(KIOSK_LIVE_THRESHOLD_MS).toBe(2 * KIOSK_HEARTBEAT_INTERVAL_MS);
    expect(bucketKioskLiveness(at(KIOSK_HEARTBEAT_INTERVAL_MS + 30 * 1000), NOW)).toEqual({ status: 'live' });
  });

  it('reports "recent" in minutes from the live threshold up to 60 minutes', () => {
    // Exactly at the live threshold flips to recent.
    expect(bucketKioskLiveness(at(KIOSK_LIVE_THRESHOLD_MS), NOW)).toEqual({
      status: 'recent',
      unit: 'minutes',
      count: Math.floor(KIOSK_LIVE_THRESHOLD_MS / MINUTE),
    });
    expect(bucketKioskLiveness(at(42 * MINUTE), NOW)).toEqual({ status: 'recent', unit: 'minutes', count: 42 });
    expect(bucketKioskLiveness(at(59 * MINUTE + 59 * 1000), NOW)).toEqual({
      status: 'recent',
      unit: 'minutes',
      count: 59,
    });
  });

  it('reports "recent" in hours from 1 hour up to the 48-hour threshold', () => {
    expect(bucketKioskLiveness(at(60 * MINUTE), NOW)).toEqual({ status: 'recent', unit: 'hours', count: 1 });
    expect(bucketKioskLiveness(at(25 * HOUR), NOW)).toEqual({ status: 'recent', unit: 'hours', count: 25 });
    expect(bucketKioskLiveness(at(KIOSK_STALE_THRESHOLD_MS - 1), NOW)).toEqual({
      status: 'recent',
      unit: 'hours',
      count: 47,
    });
  });

  it('reports "stale" in days at and beyond 48 hours', () => {
    expect(bucketKioskLiveness(at(KIOSK_STALE_THRESHOLD_MS), NOW)).toEqual({ status: 'stale', days: 2 });
    expect(bucketKioskLiveness(at(9 * DAY + 5 * HOUR), NOW)).toEqual({ status: 'stale', days: 9 });
  });
});
