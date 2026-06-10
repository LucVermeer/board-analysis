// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { createElement, isValidElement, type ReactNode } from 'react';

type ChromeProps = {
  title?: string;
  canCreate?: boolean;
  onCreate?: () => void;
  createAccessibilityLabel?: string;
  onOpenBoardSwitcher?: () => void;
  boardPillAccessibilityHint?: string;
  onHeightChange?: (height: number) => void;
  scrollY?: unknown;
  onPressTitle?: () => void;
  trailingAction?: ReactNode;
};

// Captures every prop CollapsingTopChrome receives so the wrapper's forwarding +
// gating contract can be asserted directly.
const chrome = vi.hoisted(() => ({ props: null as ChromeProps | null }));

vi.mock('react-native-reanimated', () => ({}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('../../../providers/theme-provider', () => ({
  useTheme: () => ({ brandColors: { primary: '#6D28D9' } }),
}));
vi.mock('../../Icon', () => ({ Icon: ({ name }: { name: string }) => createElement('span', { 'data-icon': name }) }));
vi.mock('../../chrome', () => ({
  CollapsingTopChrome: (props: ChromeProps) => {
    chrome.props = props;
    return createElement('div', { 'data-chrome': 'true' }, props.trailingAction);
  },
  GlassToolbarAction: ({
    children,
    onPress,
    accessibilityLabel,
  }: {
    children?: ReactNode;
    onPress?: () => void;
    accessibilityLabel?: string;
  }) => createElement('button', { onClick: onPress, 'data-action': accessibilityLabel ?? '' }, children),
}));

import { RecordTopChrome } from '../RecordTopChrome';

const scrollY = { value: 0 } as unknown as Parameters<typeof RecordTopChrome>[0]['scrollY'];

function makeProps(over: Partial<Parameters<typeof RecordTopChrome>[0]> = {}) {
  return {
    title: 'Morning session',
    onOpenBoardSwitcher: vi.fn(),
    onHeightChange: vi.fn(),
    scrollY,
    onPressTitle: vi.fn(),
    ...over,
  };
}

describe('RecordTopChrome', () => {
  beforeEach(() => {
    chrome.props = null;
  });

  it('gates the create island off (canCreate=false)', () => {
    render(<RecordTopChrome {...makeProps()} />);
    expect(chrome.props?.canCreate).toBe(false);
  });

  it('forwards title / scrollY / onHeightChange / onPressTitle / onOpenBoardSwitcher', () => {
    const onHeightChange = vi.fn();
    const onPressTitle = vi.fn();
    const onOpenBoardSwitcher = vi.fn();
    render(
      <RecordTopChrome {...makeProps({ title: 'Evening sesh', onHeightChange, onPressTitle, onOpenBoardSwitcher })} />,
    );

    expect(chrome.props?.title).toBe('Evening sesh');
    expect(chrome.props?.scrollY).toBe(scrollY);
    expect(chrome.props?.onHeightChange).toBe(onHeightChange);
    expect(chrome.props?.onPressTitle).toBe(onPressTitle);
    expect(chrome.props?.onOpenBoardSwitcher).toBe(onOpenBoardSwitcher);
  });

  it('omits the share trailingAction when onShare is not provided', () => {
    render(<RecordTopChrome {...makeProps()} />);
    expect(chrome.props?.trailingAction).toBeUndefined();
  });

  it('passes a share trailingAction (calling onShare) only when onShare is provided', () => {
    const onShare = vi.fn();
    const { container } = render(<RecordTopChrome {...makeProps({ onShare })} />);

    expect(isValidElement(chrome.props?.trailingAction)).toBe(true);
    const shareButton = container.querySelector('[data-action="mobile.session.invite"]') as HTMLButtonElement | null;
    expect(shareButton).not.toBeNull();
    shareButton!.click();
    expect(onShare).toHaveBeenCalledTimes(1);
  });
});
