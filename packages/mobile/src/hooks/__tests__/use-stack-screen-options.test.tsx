// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { createElement } from 'react';

const ctrl = vi.hoisted(() => ({
  variant: 'liquidGlass' as 'liquidGlass' | 'material',
  systemColors: { background: '#F3EFFA', label: '#16111F' },
}));

// navigation.ts reads Platform.OS at import; pin iOS so the LG branch is the
// transparent-blur header (the interesting case).
vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
vi.mock('../../providers/theme-provider', () => ({
  useTheme: () => ({ variant: ctrl.variant, systemColors: ctrl.systemColors }),
}));

import { useStackScreenOptions } from '../use-stack-screen-options';

function readOptions(): Record<string, unknown> {
  function Probe() {
    return createElement('div', { 'data-opts': JSON.stringify(useStackScreenOptions()) });
  }
  const { container } = render(createElement(Probe));
  return JSON.parse(container.querySelector('div')?.getAttribute('data-opts') ?? '{}');
}

describe('useStackScreenOptions', () => {
  it('returns the unchanged glass header on Liquid Glass (transparent blur on iOS)', () => {
    ctrl.variant = 'liquidGlass';
    const opts = readOptions();
    expect(opts.headerTransparent).toBe(true); // Platform.OS === 'ios'
    expect(opts.headerBlurEffect).toBe('systemMaterial');
    expect(opts.headerBackButtonDisplayMode).toBe('minimal');
    // No opaque Material surface bleeds into the glass header.
    expect(opts.headerStyle).toBeUndefined();
  });

  it('returns an opaque M3 app bar on Material (solid surface, onSurface tint, no blur)', () => {
    ctrl.variant = 'material';
    const opts = readOptions();
    expect(opts.headerTransparent).toBe(false);
    expect(opts.headerStyle).toEqual({ backgroundColor: '#F3EFFA' }); // systemColors.background
    expect(opts.headerTintColor).toBe('#16111F'); // systemColors.label
    expect(opts.headerTitleAlign).toBe('left');
    expect(opts.headerShadowVisible).toBe(false);
    // The iOS blur is a Liquid-Glass-only affordance — never on the Material header.
    expect(opts.headerBlurEffect).toBeUndefined();
  });
});
