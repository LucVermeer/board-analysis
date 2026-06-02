// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';

// Controls the rendering branch under test.
const ctrl = vi.hoisted(() => ({ os: 'ios' as string, glass: true, glassApi: true, rt: false }));

// Minimal RN surface. View renders a <div> exposing its background colour and
// pointerEvents so the solid path and tint overlays are inspectable.
vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return ctrl.os;
    },
  },
  StyleSheet: {
    absoluteFill: { position: 'absolute' },
    create: (styles: unknown) => styles,
  },
  View: ({ children, style, pointerEvents }: { children?: ReactNode; style?: unknown; pointerEvents?: string }) => {
    const flat = Object.assign({}, ...(Array.isArray(style) ? style : [style]).filter(Boolean)) as {
      backgroundColor?: string;
    };
    return createElement('div', { 'data-bg': flat.backgroundColor, 'data-pe': pointerEvents }, children);
  },
}));

vi.mock('@react-native-community/blur', () => ({
  BlurView: () => createElement('div', { 'data-testid': 'blur-view' }),
}));

vi.mock('expo-glass-effect', () => ({
  GlassView: ({ tintColor, children }: { tintColor?: string; children?: ReactNode }) =>
    createElement('div', { 'data-testid': 'glass-view', 'data-tint': tintColor }, children),
  isLiquidGlassAvailable: () => ctrl.glass,
  isGlassEffectAPIAvailable: () => ctrl.glassApi,
}));

vi.mock('../../hooks/use-reduce-transparency', () => ({
  useReduceTransparency: () => ctrl.rt,
}));

vi.mock('../../providers/theme-provider', () => ({
  useTheme: () => ({ systemColors: { secondaryBackground: '#1C1C1E' }, colorScheme: 'dark' }),
}));

vi.mock('../../theme/ios-colors', () => ({
  iosDarkColors: { secondaryBackground: '#1C1C1E' },
  iosLightColors: { secondaryBackground: '#F2F2F7' },
}));

import { GlassSurface } from '../GlassSurface';

beforeEach(() => {
  ctrl.os = 'ios';
  ctrl.glass = true;
  ctrl.glassApi = true;
  ctrl.rt = false;
});

describe('GlassSurface fallback hierarchy', () => {
  it('renders real Liquid Glass on iOS 26+', () => {
    const { queryByTestId } = render(<GlassSurface />);
    expect(queryByTestId('glass-view')).not.toBeNull();
    expect(queryByTestId('blur-view')).toBeNull();
  });

  it('falls back to BlurView on iOS < 26 (Liquid Glass unavailable)', () => {
    ctrl.glass = false;
    const { queryByTestId } = render(<GlassSurface />);
    expect(queryByTestId('blur-view')).not.toBeNull();
    expect(queryByTestId('glass-view')).toBeNull();
  });

  it('falls back to BlurView when the glass-effect API check fails', () => {
    ctrl.glassApi = false;
    const { queryByTestId } = render(<GlassSurface />);
    expect(queryByTestId('blur-view')).not.toBeNull();
    expect(queryByTestId('glass-view')).toBeNull();
  });

  it('renders a solid themed surface on Android (no glass, no blur)', () => {
    ctrl.os = 'android';
    const { queryByTestId, container } = render(<GlassSurface />);
    expect(queryByTestId('glass-view')).toBeNull();
    expect(queryByTestId('blur-view')).toBeNull();
    expect(container.querySelector('[data-bg="#1C1C1E"]')).not.toBeNull();
  });

  it('Reduce Transparency takes priority over Liquid Glass — solid surface', () => {
    ctrl.rt = true; // even though iOS 26 + glass are available
    const { queryByTestId } = render(<GlassSurface />);
    expect(queryByTestId('glass-view')).toBeNull();
    expect(queryByTestId('blur-view')).toBeNull();
  });

  it('applies tintColor as an overlay on the BlurView path', () => {
    ctrl.glass = false;
    const { container } = render(<GlassSurface tintColor="rgba(1, 2, 3, 0.2)" />);
    expect(container.querySelector('[data-bg="rgba(1, 2, 3, 0.2)"]')).not.toBeNull();
  });

  it('passes tintColor to GlassView (no overlay) on the glass path', () => {
    const { queryByTestId, container } = render(<GlassSurface tintColor="rgba(1, 2, 3, 0.2)" />);
    expect(queryByTestId('glass-view')?.getAttribute('data-tint')).toBe('rgba(1, 2, 3, 0.2)');
    expect(container.querySelector('[data-bg="rgba(1, 2, 3, 0.2)"]')).toBeNull();
  });
});
