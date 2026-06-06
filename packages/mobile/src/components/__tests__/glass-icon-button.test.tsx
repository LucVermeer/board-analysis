// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';

// Minimal RN surface: View → div, StyleSheet stubs the helpers the button reads.
vi.mock('react-native', () => ({
  View: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
  StyleSheet: { create: (styles: Record<string, unknown>) => styles, absoluteFill: {}, hairlineWidth: 1 },
}));

vi.mock('react-native-reanimated', () => ({
  default: { View: ({ children }: { children?: ReactNode }) => createElement('div', null, children) },
  useAnimatedStyle: () => ({}),
  useSharedValue: (value: number) => ({ value }),
  withTiming: (value: number) => value,
}));

// GlassSurface degrades elsewhere; here we only care that it received a tint.
vi.mock('../GlassSurface', () => ({
  GlassSurface: ({ tintColor }: { tintColor?: string }) =>
    createElement('div', { 'data-glass': 'true', 'data-tint': tintColor ?? '' }),
}));

type PressMockProps = {
  children?: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
};
vi.mock('../PressableSurface', () => ({
  PressableSurface: ({
    children,
    onPress,
    onLongPress,
    disabled,
    accessibilityLabel,
    accessibilityHint,
  }: PressMockProps) =>
    createElement(
      'button',
      {
        onClick: onPress,
        onDoubleClick: onLongPress,
        disabled,
        'data-label': accessibilityLabel,
        'data-hint': accessibilityHint ?? '',
      },
      children,
    ),
}));

vi.mock('../Icon', () => ({
  Icon: ({ name }: { name: string }) => createElement('span', { 'data-icon': name }),
}));

vi.mock('../Text', () => ({
  Text: ({ children }: { children?: ReactNode }) => createElement('span', { 'data-text': 'true' }, children),
}));

vi.mock('../../providers/theme-provider', () => ({
  useTheme: () => ({ brandColors: { primary: '#8C4A52' } }),
}));

vi.mock('../../theme/ios-colors', () => ({ iosSystemColors: { white: '#FFFFFF' } }));
vi.mock('../../theme/animations', () => ({ timing: { fast: 150 } }));
vi.mock('../../hooks/use-reduce-motion', () => ({ useReduceMotion: () => false }));

import { GlassIconButton } from '../GlassIconButton';

const base = { iconColor: '#000', fallbackColor: '#fff', onPress: () => {}, accessibilityLabel: 'Act' };

describe('GlassIconButton', () => {
  it('renders the icon and fires onPress', () => {
    const onPress = vi.fn();
    const { getByRole, container } = render(<GlassIconButton {...base} iconName="search" onPress={onPress} />);
    expect(container.querySelector('[data-icon="search"]')).not.toBeNull();
    fireEvent.click(getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('shows a badge only when badgeCount > 0', () => {
    const { container, rerender } = render(<GlassIconButton {...base} iconName="filter" badgeCount={3} />);
    expect(container.textContent).toContain('3');
    rerender(<GlassIconButton {...base} iconName="filter" badgeCount={0} />);
    expect(container.textContent).not.toContain('3');
  });

  it('forwards accessibilityLabel and accessibilityHint', () => {
    const { getByRole } = render(
      <GlassIconButton
        {...base}
        iconName="search"
        accessibilityLabel="Open search"
        accessibilityHint="Opens controls"
      />,
    );
    const button = getByRole('button');
    expect(button.getAttribute('data-label')).toBe('Open search');
    expect(button.getAttribute('data-hint')).toBe('Opens controls');
  });

  it('renders both glyphs when a morph target is set (cross-fade, not swap)', () => {
    const { container } = render(<GlassIconButton {...base} iconName="search" secondaryIconName="close" active />);
    expect(container.querySelector('[data-icon="search"]')).not.toBeNull();
    expect(container.querySelector('[data-icon="close"]')).not.toBeNull();
  });

  it('passes disabled through to the pressable', () => {
    const { getByRole } = render(<GlassIconButton {...base} iconName="search" disabled />);
    expect((getByRole('button') as HTMLButtonElement).disabled).toBe(true);
  });

  it('suppresses onPress immediately after onLongPress', () => {
    const onPress = vi.fn();
    const onLongPress = vi.fn();
    const { getByRole } = render(
      <GlassIconButton {...base} iconName="filter" onPress={onPress} onLongPress={onLongPress} />,
    );
    const button = getByRole('button');
    fireEvent.doubleClick(button);
    fireEvent.click(button);
    expect(onLongPress).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled();
  });
});
