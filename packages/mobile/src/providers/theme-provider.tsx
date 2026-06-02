import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform, useColorScheme, type ColorValue } from 'react-native';
import { THEME_OVERRIDE_KEY, isThemeOverride, type ThemeOverride } from '@boardsesh/key-value-storage';
import { iosSystemColors, brandColors, androidFallbackColors } from '../theme/colors';
import { textStyles, type TextVariant } from '../theme/typography';
import { spacing, borderRadius, shadows, opacity } from '../theme/tokens';
import { springs, timing } from '../theme/animations';
import { secureStorePreferences } from '../lib/preferences/secure-store-adapter';

type ColorScheme = 'light' | 'dark';

/**
 * Resolved system colors for the current color scheme.
 * On iOS these are PlatformColor values; on Android they are hex/rgba strings.
 */
type ResolvedSystemColors = {
  background: ColorValue;
  secondaryBackground: ColorValue;
  tertiaryBackground: ColorValue;
  groupedBackground: ColorValue;
  label: ColorValue;
  secondaryLabel: ColorValue;
  tertiaryLabel: ColorValue;
  separator: ColorValue;
  fill: ColorValue;
};

type Theme = {
  colorScheme: ColorScheme;
  systemColors: ResolvedSystemColors;
  brandColors: typeof brandColors;
  textStyles: typeof textStyles;
  spacing: typeof spacing;
  borderRadius: typeof borderRadius;
  shadows: typeof shadows;
  opacity: typeof opacity;
  springs: typeof springs;
  timing: typeof timing;
  themeOverride: ThemeOverride;
  setThemeOverride: (next: ThemeOverride) => Promise<void>;
};

const ThemeContext = createContext<Theme | null>(null);

/**
 * Resolve system colors for the current platform and color scheme.
 *
 * On iOS, PlatformColor handles dark mode automatically, so we just
 * pass through the PlatformColor values unchanged.
 *
 * On Android, PlatformColor is not used — we pick from the
 * androidFallbackColors light/dark map.
 */
function resolveSystemColors(colorScheme: ColorScheme): ResolvedSystemColors {
  if (Platform.OS === 'ios' && iosSystemColors) {
    // PlatformColor values adapt automatically on iOS — return as-is.
    return iosSystemColors as ResolvedSystemColors;
  }

  // Android: resolve from the single source of truth for fallback colors.
  const fallback = colorScheme === 'dark' ? androidFallbackColors.dark : androidFallbackColors.light;

  return {
    background: fallback.background,
    secondaryBackground: fallback.secondaryBackground,
    tertiaryBackground: fallback.tertiaryBackground,
    groupedBackground: fallback.groupedBackground,
    label: fallback.label,
    secondaryLabel: fallback.secondaryLabel,
    tertiaryLabel: fallback.tertiaryLabel,
    separator: fallback.separator,
    fill: fallback.fill,
  };
}

type ThemeProviderProps = {
  children: ReactNode;
};

export function ThemeProvider({ children }: ThemeProviderProps) {
  const deviceColorScheme = useColorScheme();
  // `'system'` until SecureStore hydrates — same value as a brand-new user, so
  // the first paint matches the OS preference. Once hydration completes the
  // resolved scheme switches to the saved override (if any) without a visible
  // flash when the OS already matches the override.
  const [themeOverride, setThemeOverrideState] = useState<ThemeOverride>('system');
  // Guards the hydration effect against stomping a user choice that lands
  // before the SecureStore read resolves (a tap on a settings toggle can
  // beat the keychain read on a cold launch).
  const hasUserChosenRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    secureStorePreferences
      .get<ThemeOverride>(THEME_OVERRIDE_KEY)
      .then((value) => {
        if (cancelled || hasUserChosenRef.current) return;
        if (isThemeOverride(value)) setThemeOverrideState(value);
      })
      .catch(() => {
        // Storage read can fail if SecureStore is unavailable (rare). Stay on
        // the 'system' default rather than crashing — the user's override is
        // lost for this session but the app remains usable.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const colorScheme: ColorScheme = useMemo(() => {
    if (themeOverride === 'light') return 'light';
    if (themeOverride === 'dark') return 'dark';
    return deviceColorScheme === 'dark' ? 'dark' : 'light';
  }, [themeOverride, deviceColorScheme]);

  const setThemeOverride = useCallback(async (next: ThemeOverride) => {
    hasUserChosenRef.current = true;
    setThemeOverrideState(next);
    try {
      await secureStorePreferences.set(THEME_OVERRIDE_KEY, next);
    } catch (error) {
      // Storage write failed (rare); leave the in-memory state on the user's
      // pick so the session reflects it, and log so we notice if this happens
      // consistently. Reverting on write failure would be worse — the toggle
      // would visibly snap back, which the user reads as a broken UI.
      // eslint-disable-next-line no-console
      console.warn('[theme-provider] Failed to persist theme override', error);
    }
  }, []);

  const theme = useMemo<Theme>(() => {
    const resolvedSystemColors = resolveSystemColors(colorScheme);

    return {
      colorScheme,
      systemColors: resolvedSystemColors,
      brandColors,
      textStyles,
      spacing,
      borderRadius,
      shadows,
      opacity,
      springs,
      timing,
      themeOverride,
      setThemeOverride,
    };
  }, [colorScheme, themeOverride, setThemeOverride]);

  // React 19 context provider syntax (Expo SDK 53+ / React 19)
  return <ThemeContext value={theme}>{children}</ThemeContext>;
}

/**
 * Access the current theme. Must be called inside a ThemeProvider.
 */
export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (theme === null) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return theme;
}

export type { Theme, ColorScheme, ResolvedSystemColors, TextVariant };
