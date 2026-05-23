import { describe, it, expect } from 'vitest';
import { formatAscentCount } from '../../lib/format-ascent-count';

describe('formatAscentCount', () => {
  it('returns "0" for zero ascents', () => {
    expect(formatAscentCount(0)).toBe('0');
  });

  it('returns the number as a string for counts below 1000', () => {
    expect(formatAscentCount(1)).toBe('1');
    expect(formatAscentCount(42)).toBe('42');
    expect(formatAscentCount(999)).toBe('999');
  });

  it('formats 1000 as "1.0k"', () => {
    expect(formatAscentCount(1000)).toBe('1.0k');
  });

  it('formats 1500 as "1.5k"', () => {
    expect(formatAscentCount(1500)).toBe('1.5k');
  });

  it('formats 10000 as "10.0k"', () => {
    expect(formatAscentCount(10000)).toBe('10.0k');
  });

  it('formats 100000 as "100.0k"', () => {
    expect(formatAscentCount(100000)).toBe('100.0k');
  });

  it('rounds fractional thousands to one decimal place', () => {
    expect(formatAscentCount(1234)).toBe('1.2k');
    expect(formatAscentCount(1250)).toBe('1.3k');
    expect(formatAscentCount(1999)).toBe('2.0k');
  });
});
