// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';

// Mutable across tests so we can exercise both colour schemes against the scrim.
const themeMock = vi.hoisted(() => ({ colorScheme: 'dark' as 'dark' | 'light' }));

type ViewMockProps = {
  children?: ReactNode;
  onLayout?: (event: { nativeEvent: { layout: { height: number } } }) => void;
  pointerEvents?: string;
};
vi.mock('react-native', () => ({
  View: ({ children, onLayout, pointerEvents }: ViewMockProps) =>
    createElement(
      'div',
      {
        'data-has-layout': onLayout ? 'true' : 'false',
        'data-pointer': pointerEvents ?? '',
        onClick: onLayout ? () => onLayout({ nativeEvent: { layout: { height: 72 } } }) : undefined,
      },
      children,
    ),
  StyleSheet: { create: (styles: Record<string, unknown>) => styles, absoluteFill: {}, hairlineWidth: 1 },
}));

vi.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children, colors }: { children?: ReactNode; colors?: readonly string[] }) =>
    createElement('div', { 'data-gradient': 'true', 'data-colors': JSON.stringify(colors) }, children),
}));
// useAnimatedReaction is a no-op so `collapsed` stays false; the collapsed title
// capsule never mounts but the centre-content fade wrapper always does.
vi.mock('react-native-reanimated', () => ({
  default: {
    View: ({ children, pointerEvents }: { children?: ReactNode; pointerEvents?: string }) =>
      createElement('div', { 'data-animated-view': 'true', 'data-pointer': pointerEvents ?? '' }, children),
  },
  Extrapolation: { CLAMP: 'clamp' },
  interpolate: () => 0,
  runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
  useAnimatedReaction: () => {},
  useAnimatedStyle: () => ({}),
  useDerivedValue: () => ({ value: 0 }),
}));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 0, left: 0, right: 0 }),
}));

vi.mock('../../../providers/theme-provider', () => ({
  useTheme: () => ({
    colorScheme: themeMock.colorScheme,
    systemColors: {
      label: '#000',
      separator: '#ccc',
      elevatedSurface: '#fff',
      // Non-string sentinel = an iOS PlatformColor (OpaqueColorValue); this is the
      // case that triggers the concrete scrim-colour resolution from colorScheme.
      background: { semantic: 'systemBackground' },
    },
  }),
}));
vi.mock('../../../hooks/use-native-glass', () => ({ useNativeGlass: () => false }));
vi.mock('../../../theme/tokens', () => ({ spacing: { 1: 4, 2: 8, 4: 16 }, shadows: { sm: {} } }));
vi.mock('../GlassActionToolbar', () => ({ TOP_ACTION_SIZE: 48 }));
vi.mock('../../GlassSurface', () => ({ GlassSurface: () => createElement('div', { 'data-glass': 'true' }) }));
vi.mock('../../PressableSurface', () => ({
  PressableSurface: ({
    children,
    onPress,
    accessibilityLabel,
  }: {
    children?: ReactNode;
    onPress?: () => void;
    accessibilityLabel?: string;
  }) => createElement('button', { onClick: onPress, 'data-pressable': accessibilityLabel ?? '' }, children),
}));
vi.mock('../../Text', () => ({
  Text: ({ children }: { children?: ReactNode }) => createElement('span', null, children),
}));

import { CollapsingLargeTitleHeader } from '../CollapsingLargeTitleHeader';

const scrollY = { value: 0 } as unknown as Parameters<typeof CollapsingLargeTitleHeader>[0]['scrollY'];

function makeProps(over: Partial<Parameters<typeof CollapsingLargeTitleHeader>[0]> = {}) {
  return {
    title: 'You',
    scrollY,
    onPressTitle: vi.fn(),
    onHeightChange: vi.fn(),
    ...over,
  };
}

describe('CollapsingLargeTitleHeader', () => {
  afterEach(() => {
    themeMock.colorScheme = 'dark';
  });

  it('renders the leftActions / rightActions / centerContent / children slots when provided', () => {
    const { container } = render(
      <CollapsingLargeTitleHeader
        {...makeProps({
          leftActions: createElement('div', { 'data-testid': 'left' }),
          rightActions: createElement('div', { 'data-testid': 'right' }),
          centerContent: createElement('div', { 'data-testid': 'center' }),
        })}
      >
        {createElement('div', { 'data-testid': 'children' })}
      </CollapsingLargeTitleHeader>,
    );

    expect(container.querySelector('[data-testid="left"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="right"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="center"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="children"]')).not.toBeNull();
  });

  it('omits the leftActions / rightActions / centerContent / children slots when not provided', () => {
    const { container } = render(<CollapsingLargeTitleHeader {...makeProps()} />);

    expect(container.querySelector('[data-testid="left"]')).toBeNull();
    expect(container.querySelector('[data-testid="right"]')).toBeNull();
    expect(container.querySelector('[data-testid="center"]')).toBeNull();
    expect(container.querySelector('[data-testid="children"]')).toBeNull();
  });

  it('wraps centerContent in an animated fade wrapper (so it fades out as the title takes over)', () => {
    const { container } = render(
      <CollapsingLargeTitleHeader
        {...makeProps({ centerContent: createElement('div', { 'data-testid': 'center' }) })}
      />,
    );

    // The scrim is also an animated view, so target the wrapper that actually
    // holds the centre content rather than the first animated view in the tree.
    expect(container.querySelector('[data-animated-view="true"] [data-testid="center"]')).not.toBeNull();
  });

  it('does not render the collapsed title capsule while collapsed is false', () => {
    const { container } = render(<CollapsingLargeTitleHeader {...makeProps({ title: 'You' })} />);

    // The capsule mounts a PressableSurface labelled by the title; with the
    // reaction mocked no-op, `collapsed` stays false so it never renders.
    expect(container.querySelector('[data-pressable="You"]')).toBeNull();
  });

  it('uses a concrete dark scrim colour in a dark override (not a light PlatformColor)', () => {
    // Regression: the scrim fed expo-linear-gradient a PlatformColor, which bakes
    // against the OS trait — so the header stayed light-mode white when the phone
    // was light but the app was forced dark. With colorScheme 'dark' the scrim
    // must resolve to the concrete dark background, never white.
    themeMock.colorScheme = 'dark';
    const { container } = render(<CollapsingLargeTitleHeader {...makeProps()} />);
    const gradient = container.querySelector('[data-gradient="true"]');
    const colors = JSON.parse(gradient?.getAttribute('data-colors') ?? '[]') as string[];
    expect(colors[0]).toBe('#000000');
    expect(colors).not.toContain('#FFFFFF');
  });

  it('uses the grey scene scrim colour in light, never pure white (no banding over the grey scene)', () => {
    themeMock.colorScheme = 'light';
    const { container } = render(<CollapsingLargeTitleHeader {...makeProps()} />);
    const gradient = container.querySelector('[data-gradient="true"]');
    const colors = JSON.parse(gradient?.getAttribute('data-colors') ?? '[]') as string[];
    expect(colors[0]).toBe('#F2F2F2');
    expect(colors).not.toContain('#FFFFFF');
  });

  it('reports its measured height through onHeightChange (container onLayout)', () => {
    const onHeightChange = vi.fn();
    const { container } = render(<CollapsingLargeTitleHeader {...makeProps({ onHeightChange })} />);

    fireEvent.click(container.querySelector('[data-has-layout="true"]') as HTMLElement);
    expect(onHeightChange).toHaveBeenCalledWith(72);
  });
});
