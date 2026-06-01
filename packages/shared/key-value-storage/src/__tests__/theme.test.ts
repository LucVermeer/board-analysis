import { describe, expect, it } from 'vitest';
import { THEME_OVERRIDE_KEY, isThemeOverride } from '../theme';

describe('theme', () => {
  it('exposes a stable storage key', () => {
    expect(THEME_OVERRIDE_KEY).toBe('theme_override');
  });

  it("uses only characters that satisfy expo-secure-store's regex", () => {
    // SecureStore rejects keys outside [\w.-]+ — the colon-style key we
    // started with silently threw at the platform boundary and the
    // theme-provider's catch swallowed it.
    expect(THEME_OVERRIDE_KEY).toMatch(/^[\w.-]+$/);
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
