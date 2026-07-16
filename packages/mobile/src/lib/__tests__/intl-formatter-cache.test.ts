// Every expectation pins an explicit locale (never `undefined`): Node has full
// ICU, but the host locale isn't deterministic across CI boxes — see the same
// convention in format-bytes.test.ts.

import { describe, it, expect } from 'vitest';
import { getCachedDateTimeFormat, getCachedNumberFormat } from '../intl-formatter-cache';

describe('getCachedDateTimeFormat', () => {
  it('reuses the same formatter instance for an identical locale + options', () => {
    const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
    const first = getCachedDateTimeFormat('en-US', options);
    const second = getCachedDateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    expect(second).toBe(first);
  });

  it('does not serve a stale formatter after a locale switch', () => {
    const options: Intl.DateTimeFormatOptions = { month: 'short' };
    const date = new Date('2026-01-15T00:00:00.000Z');

    const enUS = getCachedDateTimeFormat('en-US', options);
    const es = getCachedDateTimeFormat('es', options);

    expect(enUS).not.toBe(es);
    expect(enUS.format(date)).toBe('Jan');
    expect(es.format(date)).toBe('ene');

    // Re-requesting the first locale still returns its own cached formatter,
    // not the one built for the second locale in between.
    expect(getCachedDateTimeFormat('en-US', options)).toBe(enUS);
  });

  it('caches distinct options for the same locale separately', () => {
    const short = getCachedDateTimeFormat('en-US', { month: 'short' });
    const long = getCachedDateTimeFormat('en-US', { month: 'long' });
    const date = new Date('2026-01-15T00:00:00.000Z');

    expect(short).not.toBe(long);
    expect(short.format(date)).toBe('Jan');
    expect(long.format(date)).toBe('January');
  });
});

describe('getCachedNumberFormat', () => {
  it('reuses the same formatter instance for an identical locale + options', () => {
    const first = getCachedNumberFormat('en-US');
    const second = getCachedNumberFormat('en-US');
    expect(second).toBe(first);
  });

  it('does not serve a stale formatter after a locale switch', () => {
    const enUS = getCachedNumberFormat('en-US');
    const deDE = getCachedNumberFormat('de-DE');

    expect(enUS).not.toBe(deDE);
    expect(enUS.format(1234)).toBe('1,234');
    expect(deDE.format(1234)).toBe('1.234');

    expect(getCachedNumberFormat('en-US')).toBe(enUS);
  });

  it('caches distinct options for the same locale separately', () => {
    const plain = getCachedNumberFormat('en-US');
    const percent = getCachedNumberFormat('en-US', { style: 'percent' });

    expect(plain).not.toBe(percent);
    expect(plain.format(0.5)).toBe('0.5');
    expect(percent.format(0.5)).toBe('50%');
  });
});
