// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';

const haptics = vi.hoisted(() => ({ light: vi.fn() }));

vi.mock('react-native', () => ({
  View: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
  StyleSheet: { create: (styles: Record<string, unknown>) => styles },
}));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('../../../providers/theme-provider', () => ({
  useTheme: () => ({ systemColors: { fill: '#eee', label: '#111' } }),
}));
vi.mock('../../../lib/haptics', () => ({ hapticLight: haptics.light }));
vi.mock('../../../theme/tokens', () => ({ spacing: { 3: 12, 4: 16 } }));
vi.mock('../../../theme/layout', () => ({ glassSize: { hero: 64 } }));
vi.mock('../../../hooks/use-bottom-chrome-metrics', () => ({
  useBottomChromeMetrics: () => ({ floatingControlBottom: 123 }),
}));

// GlassIconButton → a button exposing the glass props we assert on. Its mere
// presence proves the FAB is glass rather than the old solid-maroon Pressable.
type GlassMockProps = {
  iconName?: string;
  iconColor?: string;
  size?: number;
  fallbackColor?: string;
  onPress?: () => void;
  accessibilityLabel?: string;
};
vi.mock('../../GlassIconButton', () => ({
  GlassIconButton: ({ iconName, iconColor, size, fallbackColor, onPress, accessibilityLabel }: GlassMockProps) =>
    createElement('button', {
      'data-glass': 'true',
      'data-icon': iconName,
      'data-icon-color': iconColor,
      'data-size': String(size),
      'data-fallback': fallbackColor,
      'data-label': accessibilityLabel,
      onClick: onPress,
    }),
}));

import { CreatePlaylistFab } from '../CreatePlaylistFab';

describe('CreatePlaylistFab', () => {
  it('renders a hero glass FAB — a plus with a high-contrast label glyph, no solid fill', () => {
    const { container } = render(createElement(CreatePlaylistFab, { onPress: vi.fn() }));
    const button = container.querySelector('[data-glass="true"]') as HTMLElement;

    expect(button).toBeTruthy();
    expect(button.getAttribute('data-icon')).toBe('plus');
    // High-contrast system label glyph (legible over bright hero cards), not maroon.
    expect(button.getAttribute('data-icon-color')).toBe('#111');
    expect(button.getAttribute('data-size')).toBe('64');
    // Neutral solid fallback (Android / Reduce Transparency), no colour fill.
    expect(button.getAttribute('data-fallback')).toBe('#eee');
  });

  it('fires haptics + onPress when tapped', () => {
    const onPress = vi.fn();
    const { container } = render(createElement(CreatePlaylistFab, { onPress }));
    fireEvent.click(container.querySelector('[data-glass="true"]') as HTMLElement);

    expect(haptics.light).toHaveBeenCalledTimes(1);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
