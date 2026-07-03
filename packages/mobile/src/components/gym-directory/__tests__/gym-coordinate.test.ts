import { describe, it, expect } from 'vitest';
import { parseCoordinate, LATITUDE_RANGE, LONGITUDE_RANGE } from '../gym-coordinate';

describe('parseCoordinate', () => {
  const lat = (text: string) => parseCoordinate(text, LATITUDE_RANGE.min, LATITUDE_RANGE.max);
  const lon = (text: string) => parseCoordinate(text, LONGITUDE_RANGE.min, LONGITUDE_RANGE.max);

  it('treats a blank field as a deliberate clear (null, no error)', () => {
    expect(lat('')).toEqual({ value: null, error: false });
    expect(lat('   ')).toEqual({ value: null, error: false });
  });

  it('parses a plain decimal', () => {
    expect(lat('48.8584')).toEqual({ value: 48.8584, error: false });
    expect(lon('-12.3')).toEqual({ value: -12.3, error: false });
  });

  it('normalizes a decimal comma (es/fr keyboards) instead of wiping the location', () => {
    expect(lat('48,8584')).toEqual({ value: 48.8584, error: false });
    expect(lon('-1,5')).toEqual({ value: -1.5, error: false });
  });

  it('flags non-empty unparseable text as an error, not a silent clear', () => {
    expect(lat('abc')).toEqual({ value: null, error: true });
    expect(lat('4.5.6')).toEqual({ value: null, error: true });
  });

  it('flags out-of-range values and accepts the boundaries', () => {
    expect(lat('91')).toEqual({ value: null, error: true });
    expect(lat('-90.1')).toEqual({ value: null, error: true });
    expect(lat('90')).toEqual({ value: 90, error: false });
    expect(lon('181')).toEqual({ value: null, error: true });
    expect(lon('180')).toEqual({ value: 180, error: false });
  });

  it('trims surrounding whitespace', () => {
    expect(lat('  -12.3  ')).toEqual({ value: -12.3, error: false });
  });
});
