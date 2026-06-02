// ColorSchemePreferenceProvider — owns the user's Light / Dark / System choice
// and applies it to the native Appearance.
//
// The mechanism matters: iOS `PlatformColor` follows the native trait
// collection, so a JS-only flag can't move native colours or chrome. Driving
// `Appearance.setColorScheme(...)` overrides the app's trait collection
// app-wide, so `PlatformColor`, `useColorScheme()`, the status bar, and the
// Liquid Glass material all resolve to the chosen scheme in lockstep. The
// existing ThemeProvider keeps reading `useColorScheme()` and just works.
//
// `app.config.ts` must stay `userInterfaceStyle: 'automatic'` — that's what
// lets `setColorScheme` drive the style at runtime.

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Appearance } from 'react-native';
import {
  getStoredColorSchemePreference,
  setStoredColorSchemePreference,
  type ColorSchemePreference,
} from '../lib/theme-preference-store';

type ColorSchemePreferenceContextValue = {
  preference: ColorSchemePreference;
  setPreference: (next: ColorSchemePreference) => void;
};

const ColorSchemePreferenceContext = createContext<ColorSchemePreferenceContextValue | undefined>(undefined);

function applyAppearance(preference: ColorSchemePreference): void {
  // 'unspecified' follows the OS; 'light'/'dark' pin the app's trait collection.
  Appearance.setColorScheme(preference === 'system' ? 'unspecified' : preference);
}

export function ColorSchemePreferenceProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ColorSchemePreference>('system');

  // Load the stored choice once and apply it. A missing key leaves the app
  // following the OS, which is already the default — no need to touch Appearance.
  useEffect(() => {
    let mounted = true;
    void getStoredColorSchemePreference().then((stored) => {
      if (!mounted || !stored) return;
      setPreferenceState(stored);
      applyAppearance(stored);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const setPreference = useMemo(
    () => (next: ColorSchemePreference) => {
      setPreferenceState(next);
      applyAppearance(next);
      void setStoredColorSchemePreference(next);
    },
    [],
  );

  const value = useMemo<ColorSchemePreferenceContextValue>(
    () => ({ preference, setPreference }),
    [preference, setPreference],
  );

  return <ColorSchemePreferenceContext.Provider value={value}>{children}</ColorSchemePreferenceContext.Provider>;
}

export function useColorSchemePreference(): ColorSchemePreferenceContextValue {
  const ctx = useContext(ColorSchemePreferenceContext);
  if (!ctx) throw new Error('useColorSchemePreference must be used within a ColorSchemePreferenceProvider');
  return ctx;
}
