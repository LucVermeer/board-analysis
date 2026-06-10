// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';

const ctrl = vi.hoisted(() => ({ variant: 'glass' as 'glass' | 'material' }));
// Captures the props the glass PinnedActionBar + Button and the Material FAB
// receive so the test can assert the variant routing + the forwarded contract.
const pinned = vi.hoisted(() => ({ props: null as Record<string, unknown> | null }));
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
        // Expose a way to fire the measured-height layout from the test.
        'data-fire-layout': onLayout ? () => onLayout({ nativeEvent: { layout: { height: 72 } } }) : undefined,
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

vi.mock('../../PinnedActionBar', () => ({
  PinnedActionBar: (props: { children?: ReactNode; testID?: string; onHeightChange?: (height: number) => void }) => {
    pinned.props = props;
    return createElement('div', { 'data-pinned': 'true', 'data-testid': props.testID }, props.children);
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
  iconMap: { 'play.fill': { ios: 'play.fill', android: 'play' }, flag: { ios: 'flag', android: 'flag-outline' } },
}));

vi.mock('../../../providers/theme-provider', () => ({ useTheme: () => ({ variant: ctrl.variant }) }));
vi.mock('../../../hooks/use-bottom-chrome-metrics', () => ({
  useBottomChromeMetrics: () => ({ fixedFooterBottom: 88 }),
}));
vi.mock('../../../theme/tokens', () => ({ spacing: { 3: 12, 4: 16 } }));

import { SessionActionFooter } from '../SessionActionFooter';

function makeProps(over: Partial<Parameters<typeof SessionActionFooter>[0]> = {}) {
  return {
    label: 'Start session',
    materialIcon: 'play.fill' as const,
    onPress: vi.fn(),
    emphasis: 'primary' as const,
    glassButtonVariant: 'filled' as const,
    testID: 'pre-session-footer',
    onHeightChange: vi.fn(),
    ...over,
  };
}

beforeEach(() => {
  ctrl.variant = 'glass';
  pinned.props = null;
  button.props = null;
  fab.props = null;
});

describe('SessionActionFooter', () => {
  describe('glass variant', () => {
    it('renders the pinned glass bar + Button, forwarding testID / onHeightChange', () => {
      const onHeightChange = vi.fn();
      const { container } = render(<SessionActionFooter {...makeProps({ onHeightChange })} />);

      expect(container.querySelector('[data-pinned="true"]')).not.toBeNull();
      expect(container.querySelector('[data-fab="true"]')).toBeNull();
      expect(pinned.props?.testID).toBe('pre-session-footer');
      expect(pinned.props?.onHeightChange).toBe(onHeightChange);
    });

    it('maps label / glassButtonVariant / disabled / loading onto the Button', () => {
      render(
        <SessionActionFooter
          {...makeProps({ label: 'End session', glassButtonVariant: 'outlined', disabled: true, loading: true })}
        />,
      );
      expect(button.props?.title).toBe('End session');
      expect(button.props?.variant).toBe('outlined');
      expect(button.props?.size).toBe('large');
      expect(button.props?.disabled).toBe(true);
      expect(button.props?.loading).toBe(true);
    });

    it('fires onPress through the Button', () => {
      const onPress = vi.fn();
      const { container } = render(<SessionActionFooter {...makeProps({ onPress })} />);
      fireEvent.click(container.querySelector('[data-button="true"]')!);
      expect(onPress).toHaveBeenCalledTimes(1);
    });
  });

  describe('material variant', () => {
    beforeEach(() => {
      ctrl.variant = 'material';
    });

    it('renders the extended FAB (not the glass bar) with the Android icon + label', () => {
      const { container } = render(<SessionActionFooter {...makeProps({ label: 'Start session' })} />);
      expect(container.querySelector('[data-pinned="true"]')).toBeNull();
      expect(container.querySelector('[data-fab="true"]')).not.toBeNull();
      expect(fab.props?.icon).toBe('play'); // iconMap['play.fill'].android
      expect(fab.props?.label).toBe('Start session');
      expect(fab.props?.mode).toBe('elevated');
    });

    it('maps emphasis onto the FAB variant and forwards disabled / loading', () => {
      render(
        <SessionActionFooter
          {...makeProps({ materialIcon: 'flag', emphasis: 'secondary', disabled: true, loading: true })}
        />,
      );
      expect(fab.props?.icon).toBe('flag-outline');
      expect(fab.props?.variant).toBe('secondary');
      expect(fab.props?.disabled).toBe(true);
      expect(fab.props?.loading).toBe(true);
    });

    it('anchors the container at fixedFooterBottom and lets taps pass through (box-none)', () => {
      const { getByTestId } = render(<SessionActionFooter {...makeProps()} />);
      const containerNode = getByTestId('pre-session-footer');
      expect(containerNode.getAttribute('data-pointer-events')).toBe('box-none');
      expect(containerNode.getAttribute('data-style')).toContain('"bottom":88');
    });

    it('reports the measured container height through onHeightChange', () => {
      const onHeightChange = vi.fn();
      const { getByTestId } = render(<SessionActionFooter {...makeProps({ onHeightChange })} />);
      const containerNode = getByTestId('pre-session-footer') as HTMLElement & { fireLayout?: () => void };
      containerNode.fireLayout?.();
      expect(onHeightChange).toHaveBeenCalledWith(72);
    });
  });
});
