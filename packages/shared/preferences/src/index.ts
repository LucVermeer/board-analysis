// Cross-platform user-preference primitives. Web injects an IndexedDB-backed
// adapter; mobile injects a SecureStore / AsyncStorage one. The package itself
// is pure TS — no DOM, no react-native — so the same key names and parse logic
// live in one place across both apps.

export type { KeyValueStorage } from './storage';
export { THEME_OVERRIDE_KEY, isThemeOverride, type ThemeOverride } from './theme';
