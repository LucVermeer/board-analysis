// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';

// Mutable so each test can exercise a resolved colour scheme.
const themeMock = vi.hoisted(() => ({ colorScheme: 'dark' as 'dark' | 'light' }));

vi.mock('react-native', () => ({
  StyleSheet: { absoluteFill: {} },
}));

// Render the mask + children so both the gradient mask and the blur are assertable
// (these vi.mocks take precedence over the global test-config aliases).
vi.mock('@react-native-masked-view/masked-view', () => ({
  default: ({ children, maskElement }: { children?: ReactNode; maskElement?: ReactNode }) =>
    createElement('div', { 'data-testid': 'masked-view' }, maskElement, children),
}));
vi.mock('@react-native-community/blur', () => ({
  BlurView: ({ blurType, blurAmount }: { blurType?: string; blurAmount?: number }) =>
    createElement('div', { 'data-testid': 'blur-view', 'data-blur-type': blurType, 'data-blur-amount': blurAmount }),
}));
vi.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ colors, locations }: { colors?: readonly string[]; locations?: readonly number[] }) =>
    createElement('div', {
      'data-testid': 'mask-gradient',
      'data-colors': JSON.stringify(colors),
      'data-locations': JSON.stringify(locations),
    }),
}));
vi.mock('../../providers/theme-provider', () => ({
  useTheme: () => ({ colorScheme: themeMock.colorScheme }),
}));

import { ProgressiveBlur } from '../ProgressiveBlur';

describe('ProgressiveBlur', () => {
  afterEach(() => {
    themeMock.colorScheme = 'dark';
  });

  it('masks a blur with a top→transparent gradient (full blur up top, clear at the bottom)', () => {
    const { container } = render(<ProgressiveBlur />);
    expect(container.querySelector('[data-testid="masked-view"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="blur-view"]')).not.toBeNull();
    const grad = container.querySelector('[data-testid="mask-gradient"]');
    const colors = JSON.parse(grad?.getAttribute('data-colors') ?? '[]') as string[];
    expect(colors[0]).toBe('#000000');
    expect(colors[colors.length - 1]).toBe('transparent');
  });

  it('uses the dark ultra-thin material when the resolved scheme is dark', () => {
    themeMock.colorScheme = 'dark';
    const { container } = render(<ProgressiveBlur />);
    expect(container.querySelector('[data-testid="blur-view"]')?.getAttribute('data-blur-type')).toBe(
      'ultraThinMaterialDark',
    );
  });

  it('uses the light ultra-thin material when the resolved scheme is light (honours the in-app override)', () => {
    themeMock.colorScheme = 'light';
    const { container } = render(<ProgressiveBlur />);
    expect(container.querySelector('[data-testid="blur-view"]')?.getAttribute('data-blur-type')).toBe(
      'ultraThinMaterialLight',
    );
  });
});
