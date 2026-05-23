export const colors = {
  primary: '#8C4A52',
  primaryHover: '#7A3F47',
  primaryActive: '#6B353D',
  secondary: '#6B7280',
  info: '#4A6F8A',
  success: '#6B9080',
  successHover: '#5A7A6C',
  successBg: '#EFF5F2',
  warning: '#C4943C',
  warningBg: '#FAF5EC',
  error: '#B8524C',
  errorBg: '#F9EFEE',
  errorMuted: 'rgba(184, 82, 76, 0.18)',
  errorMutedHover: 'rgba(184, 82, 76, 0.28)',
  purple: '#9C27B0',
  purpleHover: '#7B1FA2',
  amber: '#FBBF24',
  pink: '#EC4899',
  accentGreen: '#5fb27a',
  accentRose: '#d65a4f',
} as const;

export const neutral = {
  50: '#F9FAFB',
  100: '#F3F4F6',
  200: '#E5E7EB',
  300: '#D1D5DB',
  400: '#9CA3AF',
  500: '#6B7280',
  600: '#4B5563',
  700: '#374151',
  800: '#1F2937',
  900: '#111827',
} as const;

export const darkNeutral = {
  50: '#121212',
  100: '#222222',
  200: '#333333',
  300: '#3A3A3A',
  400: '#6B7280',
  500: '#B3B3B3',
  600: '#D1D5DB',
  700: '#E5E7EB',
  800: '#F3F4F6',
  900: '#F9FAFB',
} as const;

export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

export const borderRadius = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
} as const;

export const typography = {
  fontFamily: {
    ios: '-apple-system',
    android: 'Roboto',
  },
  fontSize: {
    xxs: 8,
    xs: 12,
    sm: 14,
    base: 16,
    lg: 18,
    xl: 20,
    '2xl': 24,
    '3xl': 30,
  },
  fontWeight: {
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
    extrabold: '800',
  },
  lineHeight: {
    tight: 1.25,
    normal: 1.5,
    relaxed: 1.75,
  },
} as const;

export const shadows = {
  xs: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 1,
    elevation: 1,
  },
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
  xl: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 12,
  },
} as const;

export const semantic = {
  selected: 'rgba(175, 45, 60, 0.28)',
  selectedHover: '#E8C8CC',
  selectedLight: 'rgba(175, 45, 60, 0.10)',
  selectedBorder: '#8C4A52',
  background: '#F9FAFB',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  surfaceOverlay: 'rgba(255, 255, 255, 0.95)',
  overlayLight: 'rgba(0, 0, 0, 0.3)',
  overlayDark: 'rgba(0, 0, 0, 0.6)',
} as const;

export const darkSemantic = {
  selected: 'rgba(175, 45, 60, 0.22)',
  selectedHover: 'rgba(175, 45, 60, 0.30)',
  selectedLight: 'rgba(175, 45, 60, 0.12)',
  selectedBorder: '#8C4A52',
  background: '#0e0e10',
  surface: '#1A1A1A',
  surfaceElevated: '#282828',
  inputSurface: '#FFFFFF',
  surfaceOverlay: 'rgba(26, 26, 26, 0.95)',
  overlayLight: 'rgba(0, 0, 0, 0.4)',
  overlayDark: 'rgba(0, 0, 0, 0.7)',
} as const;

export const darkStatusBg = {
  success: 'rgba(107, 144, 128, 0.12)',
  error: 'rgba(184, 82, 76, 0.12)',
  warning: 'rgba(196, 148, 60, 0.12)',
} as const;

export const opacity = {
  subtle: 0.7,
  disabled: 0.5,
} as const;

export type Colors = typeof colors;
export type Neutral = typeof neutral;
export type DarkNeutral = typeof darkNeutral;
export type Spacing = typeof spacing;
export type BorderRadius = typeof borderRadius;
export type Typography = typeof typography;
export type Shadows = typeof shadows;
export type Semantic = typeof semantic;
export type DarkSemantic = typeof darkSemantic;
