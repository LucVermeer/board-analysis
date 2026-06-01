import { describe, expect, it } from 'vitest';
import { THEME_OVERRIDE_KEY, isThemeOverride } from '../theme';

describe('theme', () => {
  it('exposes a stable storage key', () => {
    expect(THEME_OVERRIDE_KEY).toBe('theme:override');
  });

  it('accepts the three valid overrides', () => {
    expect(isThemeOverride('light')).toBe(true);
    expect(isThemeOverride('dark')).toBe(true);
    expect(isThemeOverride('system')).toBe(true);
  });

  it('rejects everything else', () => {
    expect(isThemeOverride('Light')).toBe(false);
    expect(isThemeOverride('')).toBe(false);
    expect(isThemeOverride(null)).toBe(false);
    expect(isThemeOverride(undefined)).toBe(false);
    expect(isThemeOverride(0)).toBe(false);
  });
});
