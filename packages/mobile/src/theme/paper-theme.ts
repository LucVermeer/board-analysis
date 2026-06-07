import { MD3DarkTheme, MD3LightTheme, type MD3Theme } from 'react-native-paper';
import { brandColors, materialSurfaces, withAlpha } from './colors';

type ColorScheme = 'light' | 'dark';

/**
 * Build a react-native-paper Material 3 theme from our existing design tokens, so
 * the Material UI variant renders authentic MD3 components tinted to the
 * Boardsesh brand (maroon #8C4A52) and consistent with our `materialSurfaces`
 * ladder. Our theme stays the source of truth — this is the downstream Paper
 * consumer; the Liquid Glass variant never touches it.
 *
 * Type scale + component shapes are left as Paper's MD3 defaults (system font:
 * Roboto on Android, San Francisco on iOS) — that IS the native Material look.
 * Only the colour roles are mapped from our tokens.
 *
 * The optional `dynamic` palette is the hook for the Material You fast-follow
 * (@pchmn/expo-material3-theme); unused today, callers pass `undefined`.
 */
export function buildPaperTheme(colorScheme: ColorScheme, dynamic?: MD3Theme['colors']): MD3Theme {
  const base = colorScheme === 'dark' ? MD3DarkTheme : MD3LightTheme;
  if (dynamic) {
    return { ...base, colors: { ...base.colors, ...dynamic } };
  }

  const surfaces = materialSurfaces[colorScheme];
  const isDark = colorScheme === 'dark';
  const onSurface = surfaces.label as string;
  const onSurfaceVariant = surfaces.secondaryLabel as string;

  return {
    ...base,
    colors: {
      ...base.colors,
      primary: brandColors.primary,
      onPrimary: '#FFFFFF',
      primaryContainer: withAlpha(brandColors.primary, isDark ? 0.32 : 0.14),
      onPrimaryContainer: onSurface,
      secondary: brandColors.primary,
      onSecondary: '#FFFFFF',
      secondaryContainer: withAlpha(brandColors.primary, isDark ? 0.28 : 0.16),
      onSecondaryContainer: onSurface,
      tertiary: brandColors.success,
      onTertiary: '#FFFFFF',
      background: surfaces.background as string,
      onBackground: onSurface,
      surface: surfaces.secondaryBackground as string,
      onSurface,
      surfaceVariant: surfaces.tertiaryBackground as string,
      onSurfaceVariant,
      outline: surfaces.separator as string,
      outlineVariant: surfaces.separator as string,
      error: brandColors.error,
      onError: '#FFFFFF',
      // Surface-tint ladder: map Paper's elevation levels onto our tonal surfaces
      // so elevated Paper components match the rest of the Material chrome.
      elevation: {
        level0: 'transparent',
        level1: surfaces.secondaryBackground as string,
        level2: surfaces.elevatedSurface as string,
        level3: surfaces.elevatedSurface as string,
        level4: surfaces.elevatedSurface as string,
        level5: surfaces.elevatedSurface as string,
      },
    },
  };
}
