import { describe, expect, it } from 'vite-plus/test';
import { isValidPlaylistColor } from '../utils';

describe('isValidPlaylistColor', () => {
  it('accepts only non-empty six-digit hex colours', () => {
    expect(isValidPlaylistColor('#A1b2C3')).toBe(true);
    expect(isValidPlaylistColor('#abc')).toBe(false);
    expect(isValidPlaylistColor('A1b2C3')).toBe(false);
    expect(isValidPlaylistColor('#A1b2C3ff')).toBe(false);
    expect(isValidPlaylistColor('')).toBe(false);
  });
});
