// ColorSchemePreferenceProvider — the app's appearance root. Owns the user's
// Light / Dark / System choice and the OS "Reduce Transparency" setting, and
// resolves both BEFORE first paint so there's no wrong-mode / wrong-material
// flash on cold start.
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
import { AccessibilityInfo, Appearance } from 'react-native';
import {
  getStoredColorSchemePreference,
  setStoredColorSchemePreference,
  type ColorSchemePreference,
} from '../lib/theme-preference-store';

type ColorSchemePreferenceContextValue = {
  preference: ColorSchemePreference;
  setPreference: (next: ColorSchemePreference) => void;
  /** OS "Reduce Transparency" — glass/blur surfaces fall back to solid when true. */
  reduceTransparency: boolean;
};

const ColorSchemePreferenceContext = createContext<ColorSchemePreferenceContextValue | undefined>(undefined);

function applyAppearance(preference: ColorSchemePreference): void {
  // 'unspecified' follows the OS; 'light'/'dark' pin the app's trait collection.
  Appearance.setColorScheme(preference === 'system' ? 'unspecified' : preference);
}

export function ColorSchemePreferenceProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ColorSchemePreference>('system');
  const [reduceTransparency, setReduceTransparency] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Resolve the stored choice + Reduce Transparency before first paint, then
  // apply the appearance. Rendering is gated on `loaded` so the tree never
  // paints in the OS scheme before the pinned choice takes effect, and the
  // toggle never shows a stale segment.
  useEffect(() => {
    let mounted = true;

    void Promise.all([getStoredColorSchemePreference(), AccessibilityInfo.isReduceTransparencyEnabled()])
      .then(([storedPreference, reduceTransparencyEnabled]) => {
        if (!mounted) return;
        const resolved = storedPreference ?? 'system';
        applyAppearance(resolved);
        setPreferenceState(resolved);
        setReduceTransparency(reduceTransparencyEnabled);
      })
      .catch(() => {
        // Never strand the app on the splash if a read fails — proceed with
        // defaults (follow OS, transparency on).
      })
      .finally(() => {
        if (mounted) setLoaded(true);
      });

    const subscription = AccessibilityInfo.addEventListener('reduceTransparencyChanged', (enabled) =>
      setReduceTransparency(enabled),
    );

    return () => {
      mounted = false;
      subscription.remove();
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
    () => ({ preference, setPreference, reduceTransparency }),
    [preference, setPreference, reduceTransparency],
  );

  // Hold first paint (under the native splash) until appearance is resolved.
  if (!loaded) return null;

  return <ColorSchemePreferenceContext.Provider value={value}>{children}</ColorSchemePreferenceContext.Provider>;
}

export function useColorSchemePreference(): ColorSchemePreferenceContextValue {
  const ctx = useContext(ColorSchemePreferenceContext);
  if (!ctx) throw new Error('useColorSchemePreference must be used within a ColorSchemePreferenceProvider');
  return ctx;
}
