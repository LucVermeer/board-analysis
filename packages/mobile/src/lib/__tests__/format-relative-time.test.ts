import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { formatRelativeTime } from '../format-relative-time';

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
