// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';

const bar = vi.hoisted(() => ({ styles: [] as unknown[] }));
const bottomChrome = vi.hoisted(() => ({ metrics: { fixedFooterBottom: 88 } }));
const glass = vi.hoisted(() => ({ native: false }));

type ViewMockProps = {
  children?: ReactNode;
  testID?: string;
  style?: unknown;
  onLayout?: (event: { nativeEvent: { layout: { height: number } } }) => void;
};
vi.mock('react-native', () => ({
  View: ({ children, testID, style, onLayout }: ViewMockProps) => {
    if (testID === 'pinned-bar') {
      bar.styles = Array.isArray(style) ? style : [style];
    }
    return createElement(
      'div',
      {
        'data-testid': testID,
        'data-has-layout': onLayout ? 'true' : 'false',
        onClick: onLayout ? () => onLayout({ nativeEvent: { layout: { height: 56 } } }) : undefined,
      },
      children,
    );
  },
  StyleSheet: { create: (styles: Record<string, unknown>) => styles, absoluteFill: {}, hairlineWidth: 1 },
}));

vi.mock('../GlassSurface', () => ({ GlassSurface: () => createElement('div', { 'data-glass': 'true' }) }));
vi.mock('../../providers/theme-provider', () => ({
  useTheme: () => ({ systemColors: { background: '#fff', separator: '#ccc' } }),
}));
vi.mock('../../hooks/use-native-glass', () => ({ useNativeGlass: () => glass.native }));
vi.mock('../../hooks/use-bottom-chrome-metrics', () => ({
  useBottomChromeMetrics: () => bottomChrome.metrics,
}));
vi.mock('../../theme/tokens', () => ({ spacing: { 3: 12, 4: 16 } }));

import { PinnedActionBar } from '../PinnedActionBar';

function getStyleValue(styles: unknown[], key: string): unknown {
  for (const style of styles) {
    if (style == null || typeof style !== 'object' || Array.isArray(style)) continue;
    const record = style as Record<string, unknown>;
    if (key in record) return record[key];
  }
  return undefined;
}

describe('PinnedActionBar', () => {
  beforeEach(() => {
    bar.styles = [];
    bottomChrome.metrics = { fixedFooterBottom: 88 };
    glass.native = false;
  });

  it('renders its children', () => {
    const { container } = render(
      <PinnedActionBar>{createElement('div', { 'data-testid': 'start-button' })}</PinnedActionBar>,
    );
    expect(container.querySelector('[data-testid="start-button"]')).not.toBeNull();
  });

  it('reports the measured height through onHeightChange', () => {
    const onHeightChange = vi.fn();
    const { container } = render(
      <PinnedActionBar onHeightChange={onHeightChange}>{createElement('div')}</PinnedActionBar>,
    );
    fireEvent.click(container.querySelector('[data-has-layout="true"]') as HTMLElement);
    expect(onHeightChange).toHaveBeenCalledWith(56);
  });

  it('does not attach onLayout when onHeightChange is omitted', () => {
    const { container } = render(<PinnedActionBar testID="pinned-bar">{createElement('div')}</PinnedActionBar>);
    expect(container.querySelector('[data-testid="pinned-bar"]')?.getAttribute('data-has-layout')).toBe('false');
  });

  it('pins the bar at the bottom-chrome fixedFooterBottom offset', () => {
    bottomChrome.metrics = { fixedFooterBottom: 120 };
    const { container } = render(<PinnedActionBar testID="pinned-bar">{createElement('div')}</PinnedActionBar>);
    // Touch the rendered node so the View mock has captured the style array.
    expect(container.querySelector('[data-testid="pinned-bar"]')).not.toBeNull();
    expect(getStyleValue(bar.styles, 'bottom')).toBe(120);
  });

  it('applies the hairline top border when native glass is unavailable', () => {
    glass.native = false;
    render(<PinnedActionBar testID="pinned-bar">{createElement('div')}</PinnedActionBar>);
    expect(getStyleValue(bar.styles, 'borderTopWidth')).toBe(1);
    expect(getStyleValue(bar.styles, 'borderTopColor')).toBe('#ccc');
  });

  it('omits the hairline top border when native glass is available', () => {
    glass.native = true;
    render(<PinnedActionBar testID="pinned-bar">{createElement('div')}</PinnedActionBar>);
    expect(getStyleValue(bar.styles, 'borderTopWidth')).toBeUndefined();
  });
});
