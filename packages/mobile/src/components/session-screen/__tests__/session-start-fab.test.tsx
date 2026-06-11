// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';

const ctrl = vi.hoisted(() => ({ variant: 'glass' as 'glass' | 'material' }));
// Captures the props the glass Button and the Material FAB receive so the test can
// assert the variant routing + the forwarded contract.
const button = vi.hoisted(() => ({ props: null as Record<string, unknown> | null }));
const fab = vi.hoisted(() => ({ props: null as Record<string, unknown> | null }));

vi.mock('react-native', () => ({
  View: ({
    children,
    onLayout,
    style,
    testID,
    pointerEvents,
  }: {
    children?: ReactNode;
    onLayout?: (event: { nativeEvent: { layout: { height: number } } }) => void;
    style?: unknown;
    testID?: string;
    pointerEvents?: string;
  }) =>
    createElement(
      'div',
      {
        ...(testID ? { 'data-testid': testID } : {}),
        'data-style': JSON.stringify(style),
        'data-pointer-events': pointerEvents ?? '',
        // Expose the measured-height layout so the test can fire it.
        ref: (node: (HTMLElement & { fireLayout?: () => void }) | null) => {
          if (node && onLayout) node.fireLayout = () => onLayout({ nativeEvent: { layout: { height: 72 } } });
        },
      },
      children,
    ),
  StyleSheet: { create: (styles: Record<string, unknown>) => styles },
}));

vi.mock('react-native-paper', () => ({
  FAB: (props: Record<string, unknown>) => {
    fab.props = props;
    return createElement('button', { 'data-fab': 'true', onClick: props.onPress as () => void }, String(props.label));
  },
}));

vi.mock('../../Button', () => ({
  Button: (props: Record<string, unknown>) => {
    button.props = props;
    return createElement(
      'button',
      { 'data-button': 'true', onClick: props.onPress as () => void },
      String(props.title),
    );
  },
}));

vi.mock('../../icon-map', () => ({
  iconMap: { 'play.fill': { ios: 'play.fill', android: 'play' } },
}));

vi.mock('../../../providers/theme-provider', () => ({ useTheme: () => ({ variant: ctrl.variant }) }));
vi.mock('../../../hooks/use-bottom-chrome-metrics', () => ({
  useBottomChromeMetrics: () => ({ fixedFooterBottom: 88 }),
}));
vi.mock('../../../theme/tokens', () => ({ spacing: { 2: 8, 4: 16 } }));

import { SessionStartFab } from '../SessionStartFab';

function makeProps(over: Partial<Parameters<typeof SessionStartFab>[0]> = {}) {
  return {
    label: 'Start session',
    materialIcon: 'play.fill' as const,
    onPress: vi.fn(),
    testID: 'pre-session-footer',
    onHeightChange: vi.fn(),
    ...over,
  };
}

beforeEach(() => {
  ctrl.variant = 'glass';
  button.props = null;
  fab.props = null;
});

describe('SessionStartFab', () => {
  describe('glass variant', () => {
    it('floats a filled Button capsule at fixedFooterBottom (box-none, no FAB)', () => {
      const { getByTestId, container } = render(<SessionStartFab {...makeProps()} />);

      expect(container.querySelector('[data-fab="true"]')).toBeNull();
      expect(container.querySelector('[data-button="true"]')).not.toBeNull();
      const node = getByTestId('pre-session-footer');
      expect(node.getAttribute('data-pointer-events')).toBe('box-none');
      // fixedFooterBottom clears the tab bar (where it overlays) + any climb accessory.
      expect(node.getAttribute('data-style')).toContain('"bottom":88');
    });

    it('renders the filled, large Button and forwards label / disabled / loading', () => {
      render(<SessionStartFab {...makeProps({ label: 'Start session', disabled: true, loading: true })} />);

      expect(button.props?.title).toBe('Start session');
      expect(button.props?.variant).toBe('filled');
      expect(button.props?.size).toBe('large');
      expect(button.props?.disabled).toBe(true);
      expect(button.props?.loading).toBe(true);
    });

    it('fires onPress through the Button', () => {
      const onPress = vi.fn();
      const { container } = render(<SessionStartFab {...makeProps({ onPress })} />);
      fireEvent.click(container.querySelector('[data-button="true"]')!);
      expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('reports the measured container height through onHeightChange', () => {
      const onHeightChange = vi.fn();
      const { getByTestId } = render(<SessionStartFab {...makeProps({ onHeightChange })} />);
      const node = getByTestId('pre-session-footer') as HTMLElement & { fireLayout?: () => void };
      node.fireLayout?.();
      expect(onHeightChange).toHaveBeenCalledWith(72);
    });
  });

  describe('material variant', () => {
    beforeEach(() => {
      ctrl.variant = 'material';
    });

    it('renders the extended FAB (not the Button) at fixedFooterBottom (box-none)', () => {
      const { getByTestId, container } = render(<SessionStartFab {...makeProps({ label: 'Start session' })} />);

      expect(container.querySelector('[data-button="true"]')).toBeNull();
      expect(container.querySelector('[data-fab="true"]')).not.toBeNull();
      expect(fab.props?.icon).toBe('play'); // iconMap['play.fill'].android
      expect(fab.props?.label).toBe('Start session');
      expect(fab.props?.variant).toBe('primary');
      expect(fab.props?.mode).toBe('elevated');
      const node = getByTestId('pre-session-footer');
      expect(node.getAttribute('data-pointer-events')).toBe('box-none');
      expect(node.getAttribute('data-style')).toContain('"bottom":88');
    });

    it('forwards disabled / loading to the FAB', () => {
      render(<SessionStartFab {...makeProps({ disabled: true, loading: true })} />);
      expect(fab.props?.disabled).toBe(true);
      expect(fab.props?.loading).toBe(true);
    });
  });
});
