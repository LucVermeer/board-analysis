// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';

// Controls the resolved UI variant the Toast branches on.
const ctrl = vi.hoisted(() => ({ variant: 'material' as 'material' | 'liquidGlass' }));

type ViewMockProps = { children?: ReactNode };
vi.mock('react-native', () => ({
  View: ({ children }: ViewMockProps) => createElement('div', { 'data-view': 'true' }, children),
  StyleSheet: { create: (styles: Record<string, unknown>) => styles, absoluteFill: {} },
}));

// Reanimated Animated.View → div exposing accessibility props (glass path).
vi.mock('react-native-reanimated', () => ({
  default: {
    View: ({ children, accessibilityRole }: { children?: ReactNode; accessibilityRole?: string }) =>
      createElement('div', { 'data-animated': 'true', 'data-role': accessibilityRole ?? '' }, children),
  },
  FadeIn: { duration: () => ({}) },
  FadeOut: { duration: () => ({}) },
}));

// Paper Snackbar → div exposing visible/duration/children + onDismiss.
type SnackbarMockProps = {
  visible?: boolean;
  duration?: number;
  onDismiss?: () => void;
  children?: ReactNode;
};
vi.mock('react-native-paper', () => ({
  Snackbar: ({ visible, duration, onDismiss, children }: SnackbarMockProps) =>
    createElement(
      'div',
      {
        'data-paper-snackbar': 'true',
        'data-visible': visible ? 'true' : 'false',
        'data-duration': String(duration ?? ''),
        onClick: onDismiss,
      },
      children,
    ),
}));

vi.mock('expo-router', () => ({ useSegments: () => ['(tabs)', 'climbs'] }));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}));

vi.mock('../Text', () => ({
  Text: ({ children }: { children?: ReactNode }) => createElement('span', { 'data-text': 'true' }, children),
}));
vi.mock('../Icon', () => ({ Icon: ({ name }: { name: string }) => createElement('i', { 'data-icon': name }) }));
vi.mock('../../theme/colors', () => ({
  brandColors: { success: '#34C759', error: '#FF3B30', primary: '#6D28D9', warning: '#FF9500' },
  withAlpha: (color: string) => color,
}));
vi.mock('../../theme/tokens', () => ({ borderRadius: { full: 999 }, spacing: { 2: 8, 3: 12, 4: 16 } }));
vi.mock('../../theme/layout', () => ({ TAB_BAR_HEIGHT: 49, TOOLBAR_RESERVE: 56 }));
vi.mock('../../lib/route-segments', () => ({ isTabsRoute: () => true }));
vi.mock('../../providers/theme-provider', () => ({
  useTheme: () => ({
    variant: ctrl.variant,
    colorScheme: 'light',
    systemColors: { secondaryBackground: '#EEE', label: '#000' },
  }),
}));

import { Toast } from '../Toast';

const toast = { id: 't1', message: 'Saved tick', variant: 'success' as const, duration: 3000 };

describe('Toast', () => {
  it('renders a Paper Snackbar on the Material variant', () => {
    ctrl.variant = 'material';
    const { container } = render(<Toast toast={toast} onDismiss={() => {}} />);
    const snackbar = container.querySelector('[data-paper-snackbar]');
    expect(snackbar).not.toBeNull();
    expect(snackbar?.getAttribute('data-visible')).toBe('true');
    expect(snackbar?.getAttribute('data-duration')).toBe('3000'); // duration mapped through
    expect(snackbar?.textContent).toContain('Saved tick'); // message mapped through
    // The glass animated pill must not render on Material.
    expect(container.querySelector('[data-animated]')).toBeNull();
  });

  it('routes Paper onDismiss to onDismiss(toast.id)', () => {
    ctrl.variant = 'material';
    const onDismiss = vi.fn();
    const { container } = render(<Toast toast={toast} onDismiss={onDismiss} />);
    (container.querySelector('[data-paper-snackbar]') as HTMLElement).click();
    expect(onDismiss).toHaveBeenCalledWith('t1');
  });

  it('renders the Liquid Glass animated pill on the Liquid Glass variant', () => {
    ctrl.variant = 'liquidGlass';
    const { container } = render(<Toast toast={toast} onDismiss={() => {}} />);
    const animated = container.querySelector('[data-animated]');
    expect(animated).not.toBeNull();
    expect(animated?.getAttribute('data-role')).toBe('alert');
    expect(container.querySelector('[data-icon="success"]')).not.toBeNull();
    expect(container.textContent).toContain('Saved tick');
    expect(container.querySelector('[data-paper-snackbar]')).toBeNull();
  });

  it('auto-dismisses via timer on the Liquid Glass variant', () => {
    vi.useFakeTimers();
    ctrl.variant = 'liquidGlass';
    const onDismiss = vi.fn();
    render(<Toast toast={toast} onDismiss={onDismiss} />);
    expect(onDismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(3000);
    expect(onDismiss).toHaveBeenCalledWith('t1');
    vi.useRealTimers();
  });
});
