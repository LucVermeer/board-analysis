import { Platform, PlatformColor } from 'react-native';

/**
 * iOS semantic system colors via PlatformColor.
 * These automatically adapt to light/dark mode and accessibility settings.
 * On Android, we fall back to manual hex values.
 */

function iosColor(iosName: string, androidLight: string, androidDark: string) {
  if (Platform.OS === 'ios') {
    return PlatformColor(iosName);
  }
  // Android fallback — consumers must pass the correct value based on color scheme.
  // We return the light variant here; the theme provider resolves dark mode.
  return { light: androidLight, dark: androidDark };
}

/**
 * System colors that adapt to the platform's appearance.
 *
 * On iOS these resolve to UIKit semantic colors via PlatformColor and
 * automatically respond to light/dark mode, contrast settings, etc.
 *
 * On Android they resolve to a { light, dark } pair that the ThemeProvider
 * picks from based on the current color scheme.
 */
export const systemColors = {
  background: iosColor('systemBackground', '#FFFFFF', '#000000'),
  secondaryBackground: iosColor('secondarySystemBackground', '#F2F2F7', '#1C1C1E'),
  tertiaryBackground: iosColor('tertiarySystemBackground', '#FFFFFF', '#2C2C2E'),
  groupedBackground: iosColor('systemGroupedBackground', '#F2F2F7', '#000000'),
  label: iosColor('label', '#000000', '#FFFFFF'),
  secondaryLabel: iosColor('secondaryLabel', '#3C3C43', '#EBEBF5'),
  tertiaryLabel: iosColor('tertiaryLabel', '#3C3C43', '#EBEBF5'),
  separator: iosColor('separator', '#C6C6C8', '#38383A'),
  fill: iosColor('systemFill', '#787880', '#787880'),
} as const;

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
    label: '#FFFFFF',
    secondaryLabel: 'rgba(235, 235, 245, 0.6)',
    tertiaryLabel: 'rgba(235, 235, 245, 0.3)',
    separator: 'rgba(84, 84, 88, 0.6)',
    fill: 'rgba(120, 120, 128, 0.36)',
  },
} as const;

export type SystemColors = typeof systemColors;
export type BrandColors = typeof brandColors;
export type AndroidFallbackColors = typeof androidFallbackColors;
