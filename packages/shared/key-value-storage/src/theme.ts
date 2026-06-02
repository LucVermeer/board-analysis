// Theme override preference: user's explicit choice on top of the platform's
// system colour scheme. `'system'` (or absent) means follow the OS; `'light'`
// and `'dark'` force a mode. Web persists this via IndexedDB; mobile via
// SecureStore. The storage key lives here so both apps read/write the same
// slot — useful if we ever sync preferences server-side.
//
// The key uses only [\w.-] so it satisfies expo-secure-store's validator
// (anything with `:` or other punctuation throws at the platform boundary).

export const THEME_OVERRIDE_KEY = 'theme_override';

export type ThemeOverride = 'light' | 'dark' | 'system';

export function isThemeOverride(value: unknown): value is ThemeOverride {
  return value === 'light' || value === 'dark' || value === 'system';
}
