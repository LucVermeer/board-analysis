import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { countHolds, formatRelativeTime } from '../draft-format';

describe('countHolds', () => {
  it('counts each p{id}r{code} token', () => {
    expect(countHolds('p1080r15p1140r12p1188r13')).toBe(3);
    expect(countHolds('p5r1')).toBe(1);
  });

  it('returns 0 for an empty or token-free string', () => {
    expect(countHolds('')).toBe(0);
    expect(countHolds('not a frames string')).toBe(0);
  });

  it('returns 0 for null or undefined frames', () => {
    // The Climb type says frames is a string, but a stale cache or edge-case
    // response must not crash the draft row.
    expect(countHolds(null)).toBe(0);
    expect(countHolds(undefined)).toBe(0);
  });

  it('ignores stray characters between tokens', () => {
    // Aurora frames have no separators, but be robust to anything non-token.
    expect(countHolds(' p1r2 , p3r4 ')).toBe(2);
  });

  it('does not match a placement id without a role code', () => {
    expect(countHolds('p1080')).toBe(0);
  });
});

describe('formatRelativeTime', () => {
  // Pin "now" so the relative deltas are deterministic.
  const NOW = new Date('2026-06-04T12:00:00.000Z');
  const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it('returns an empty string for missing or unparseable input', () => {
    expect(formatRelativeTime(null)).toBe('');
    expect(formatRelativeTime(undefined)).toBe('');
    expect(formatRelativeTime('')).toBe('');
    expect(formatRelativeTime('not-a-date')).toBe('');
  });

  it('formats sub-minute deltas', () => {
    expect(formatRelativeTime(ago(5_000))).toBe('a few seconds ago');
  });

  it('rolls up to minutes, hours, and days', () => {
    expect(formatRelativeTime(ago(5 * 60_000))).toBe('5 minutes ago');
    expect(formatRelativeTime(ago(3 * 3_600_000))).toBe('3 hours ago');
    expect(formatRelativeTime(ago(2 * 86_400_000))).toBe('2 days ago');
  });

  it('rolls up to months and years past the day/month thresholds', () => {
    expect(formatRelativeTime(ago(60 * 86_400_000))).toBe('2 months ago');
    expect(formatRelativeTime(ago(400 * 86_400_000))).toBe('a year ago');
  });

  it('parses naive DB timestamps (no Z suffix) as UTC', () => {
    // created_at comes from naive timestamp columns; Drizzle returns them
    // without a timezone marker and they must be read as UTC.
    expect(formatRelativeTime('2026-06-04 11:55:00')).toBe('5 minutes ago');
  });

  it('works without Intl.RelativeTimeFormat, like Hermes on device', () => {
    // Regression test for the TestFlight drafts crash: Hermes ships an
    // incomplete Intl (no RelativeTimeFormat), while Node — where these tests
    // run — has the full implementation, so a direct Intl dependency passes CI
    // and then hard-crashes release builds.
    const intlWithoutRelativeTimeFormat = Object.create(
      Object.getPrototypeOf(Intl),
      Object.getOwnPropertyDescriptors(Intl),
    ) as Record<string, unknown>;
    delete intlWithoutRelativeTimeFormat.RelativeTimeFormat;
    vi.stubGlobal('Intl', intlWithoutRelativeTimeFormat);
    try {
      expect(formatRelativeTime(ago(5 * 60_000))).toBe('5 minutes ago');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
