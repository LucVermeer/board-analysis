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

  it('ignores stray characters between tokens', () => {
    // Aurora frames have no separators, but be robust to anything non-token.
    expect(countHolds(' p1r2 , p3r4 ')).toBe(2);
  });

  it('does not match a placement id without a role code', () => {
    expect(countHolds('p1080')).toBe(0);
  });
});

describe('formatRelativeTime', () => {
  // Pin "now" so the relative deltas are deterministic. Compare against the same
  // Intl formatter the helper uses, so the assertions hold under any locale.
  const NOW = new Date('2026-06-04T12:00:00.000Z');
  const fmt = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
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

  it('formats sub-minute deltas in seconds', () => {
    expect(formatRelativeTime(ago(5_000))).toBe(fmt.format(-5, 'second'));
  });

  it('rolls up to minutes, hours, and days', () => {
    expect(formatRelativeTime(ago(5 * 60_000))).toBe(fmt.format(-5, 'minute'));
    expect(formatRelativeTime(ago(3 * 3_600_000))).toBe(fmt.format(-3, 'hour'));
    expect(formatRelativeTime(ago(2 * 86_400_000))).toBe(fmt.format(-2, 'day'));
  });

  it('rolls up to months and years past the day/month thresholds', () => {
    expect(formatRelativeTime(ago(60 * 86_400_000))).toBe(fmt.format(-2, 'month'));
    expect(formatRelativeTime(ago(400 * 86_400_000))).toBe(fmt.format(-1, 'year'));
  });
});
