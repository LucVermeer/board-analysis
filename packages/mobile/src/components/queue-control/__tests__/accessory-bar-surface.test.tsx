// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';

const ctrl = vi.hoisted(() => ({
  mode: 'material' as 'glass' | 'blur' | 'material' | 'solid',
  variant: 'material' as 'liquidGlass' | 'material',
}));

vi.mock('react-native', () => ({
  View: ({ children, style }: { children?: ReactNode; style?: unknown }) =>
    createElement('div', { 'data-view': 'true', 'data-style': JSON.stringify(style) }, children),
  StyleSheet: { absoluteFill: {}, create: (styles: Record<string, unknown>) => styles, hairlineWidth: 1 },
}));

vi.mock('../../GlassSurface', () => ({
  GlassSurface: () => createElement('div', { 'data-glass': 'true' }),
}));

vi.mock('../../../hooks/use-effective-surface-mode', () => ({
  useEffectiveSurfaceMode: () => ctrl.mode,
}));

vi.mock('../../../providers/theme-provider', () => ({
  useTheme: () => ({
    variant: ctrl.variant,
    systemColors: {
      elevatedSurface: '#FFFFFF',
      separator: '#CCCCCC',
    },
  }),
}));

vi.mock('../../../theme/tokens', () => ({
  shadows: { sm: { elevation: 2 } },
}));

import { AccessoryBarSurface } from '../AccessoryBarSurface';

describe('AccessoryBarSurface', () => {
  beforeEach(() => {
    ctrl.mode = 'material';
    ctrl.variant = 'material';
  });

  it('renders the Material docked treatment as an opaque full-width bar surface', () => {
    const { container } = render(
      <AccessoryBarSurface height={48} treatment="docked">
        child
      </AccessoryBarSurface>,
    );

    const surface = container.querySelector('[data-view]');
    const style = surface?.getAttribute('data-style') ?? '';
    expect(style).toContain('"height":48');
    expect(style).toContain('"borderRadius":0');
    expect(style).toContain('"backgroundColor":"#FFFFFF"');
    expect(style).toContain('"borderTopWidth":1');
    expect(style).toContain('"borderTopColor":"#CCCCCC"');
    expect(style).not.toContain('"elevation":2');
    expect(container.querySelector('[data-glass]')).toBeNull();
  });

  it('keeps Material on the opaque surface path when reduce-transparency resolves mode to solid', () => {
    ctrl.mode = 'solid';
    ctrl.variant = 'material';
    const { container } = render(
      <AccessoryBarSurface height={48} treatment="docked">
        child
      </AccessoryBarSurface>,
    );

    expect(container.querySelector('[data-glass]')).toBeNull();
    expect(container.querySelector('[data-view]')?.getAttribute('data-style')).toContain('"backgroundColor":"#FFFFFF"');
  });
});
