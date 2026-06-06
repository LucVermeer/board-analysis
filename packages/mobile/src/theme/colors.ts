import { Platform, PlatformColor, type ColorValue } from 'react-native';

/**
 * iOS semantic system colors via PlatformColor.
 * These automatically adapt to light/dark mode and accessibility settings.
 *
 * This map is only populated on iOS. On Android, the ThemeProvider resolves
 * colors from `androidFallbackColors` instead. All color access should go
 * through `useTheme().systemColors` — never consume this directly.
 */
export const iosSystemColors: Record<string, ColorValue> | null =
  Platform.OS === 'ios'
    ? {
        background: PlatformColor('systemBackground'),
        secondaryBackground: PlatformColor('secondarySystemBackground'),
        tertiaryBackground: PlatformColor('tertiarySystemBackground'),
        groupedBackground: PlatformColor('systemGroupedBackground'),
        // Raised tile on top of a secondary/fill surface (e.g. the selected
        // segmented-control pill). tertiarySystemBackground sits a clear step
        // above secondary in both light and dark.
        elevatedSurface: PlatformColor('tertiarySystemBackground'),
        label: PlatformColor('label'),
        secondaryLabel: PlatformColor('secondaryLabel'),
        tertiaryLabel: PlatformColor('tertiaryLabel'),
        separator: PlatformColor('separator'),
        fill: PlatformColor('systemFill'),
      }
    : null;

/**
 * Brand colors are the same on all platforms and in all color schemes.
 */
export const brandColors = {
  tint: '#8C4A52',
  primary: '#8C4A52',
  success: '#6B9080',
  warning: '#C4943C',
  error: '#B8524C',
} as const;

/**
 * Android-only fallback hex values for system colors, keyed by color scheme.
 * Used by the ThemeProvider to resolve the { light, dark } pairs on Android.
 */
export const androidFallbackColors = {
  light: {
    background: '#FFFFFF',
    secondaryBackground: '#F2F2F7',
    tertiaryBackground: '#FFFFFF',
    groupedBackground: '#F2F2F7',
    elevatedSurface: '#FFFFFF',
    label: '#000000',
    secondaryLabel: 'rgba(60, 60, 67, 0.6)',
    tertiaryLabel: 'rgba(60, 60, 67, 0.3)',
    separator: 'rgba(60, 60, 67, 0.29)',
    fill: 'rgba(120, 120, 128, 0.2)',
  },
  dark: {
    background: '#000000',
    secondaryBackground: '#1C1C1E',
    tertiaryBackground: '#2C2C2E',
    groupedBackground: '#000000',
    elevatedSurface: '#2C2C2E',
    label: '#FFFFFF',
    secondaryLabel: 'rgba(235, 235, 245, 0.6)',
    tertiaryLabel: 'rgba(235, 235, 245, 0.3)',
    separator: 'rgba(84, 84, 88, 0.6)',
    fill: 'rgba(120, 120, 128, 0.36)',
  },
} as const;

/**
 * Material 3 tonal surfaces for the Material UI variant, keyed by color scheme.
 * Same shape as `androidFallbackColors` so the ThemeProvider can return them
 * directly as the resolved system colors on ANY platform when the user is on the
 * Material variant (including iOS 26 hardware where they chose Material).
 *
 * Neutrals are warmed toward the maroon brand tint (#8C4A52) so Material reads as
 * the same product as Liquid Glass rather than a generic M3 theme. The Material
 * feel comes from elevation shadows, ripple, the nav active-indicator pill, and
 * bounded radii — not from a different palette. Labels keep the iOS-derived
 * neutral values so text contrast matches the glass variant exactly.
 */
export const materialSurfaces = {
  light: {
    // M3 base surface — warm-tinted so cards/elevation read against it.
    background: '#F4ECEC',
    // Cards and sheets sit a step up from the base (surface container low).
    secondaryBackground: '#FFFFFF',
    tertiaryBackground: '#FFFFFF',
    groupedBackground: '#F4ECEC',
    // Raised tile (selected segmented pill, elevated bar) — surface + elevation.
    elevatedSurface: '#FFFFFF',
    label: '#000000',
    secondaryLabel: 'rgba(60, 60, 67, 0.6)',
    tertiaryLabel: 'rgba(60, 60, 67, 0.3)',
    // M3 outline-variant.
    separator: 'rgba(60, 60, 67, 0.18)',
    // Faint maroon track for segmented controls / fills.
    fill: 'rgba(140, 74, 82, 0.1)',
  },
  dark: {
    background: '#141011',
    secondaryBackground: '#1F1A1B',
    tertiaryBackground: '#2A2425',
    groupedBackground: '#141011',
    elevatedSurface: '#2A2425',
    label: '#FFFFFF',
    secondaryLabel: 'rgba(235, 235, 245, 0.6)',
    tertiaryLabel: 'rgba(235, 235, 245, 0.3)',
    separator: 'rgba(235, 235, 245, 0.18)',
    fill: 'rgba(235, 220, 222, 0.12)',
  },
} as const;

export type SystemColorKey = keyof typeof androidFallbackColors.light;
export type BrandColors = typeof brandColors;
export type AndroidFallbackColors = typeof androidFallbackColors;
export type MaterialSurfaces = typeof materialSurfaces;

/**
 * Apply an alpha (0–1) to a colour. Handles `#RGB` and `#RRGGBB` hex by
 * emitting an `rgba()` string; any other format (already-`rgba()`, named
 * colour, PlatformColor) is returned unchanged so this never produces an
 * invalid colour value. Safer than concatenating a hex alpha suffix, which
 * only works for 6-digit hex.
 */
export function withAlpha(color: string, alpha: number): string {
  const hex = color.replace('#', '');
  const full = hex.length === 3 ? hex.replace(/(.)/g, '$1$1') : hex;
  if (full.length !== 6 || /[^0-9a-fA-F]/.test(full)) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn(`[withAlpha] expected a hex colour, got "${color}" — returning it unchanged (alpha not applied)`);
    }
    return color;
  }
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
