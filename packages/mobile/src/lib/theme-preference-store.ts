// Persisted Light / Dark / System appearance choice. Backed by the shared
// AsyncStorage preference store (non-secret UI preference).

import { getPreference, setPreference } from './preference-store';

export type ColorSchemePreference = 'light' | 'dark' | 'system';

const COLOR_SCHEME_PREFERENCE_KEY = 'pref.colorScheme';

export function getStoredColorSchemePreference(): Promise<ColorSchemePreference | null> {
  return getPreference<ColorSchemePreference>(COLOR_SCHEME_PREFERENCE_KEY);
}

export function setStoredColorSchemePreference(preference: ColorSchemePreference): Promise<void> {
  return setPreference(COLOR_SCHEME_PREFERENCE_KEY, preference);
}
