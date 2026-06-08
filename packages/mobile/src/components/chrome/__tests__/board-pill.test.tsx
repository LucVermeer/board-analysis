// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import type { UserBoard } from '@boardsesh/shared-schema';

type BoardLabelFields = Pick<UserBoard, 'name' | 'angle' | 'boardType' | 'sizeName' | 'layoutName'>;

const ctrl = vi.hoisted(() => ({ board: null as BoardLabelFields | null }));
const haptics = vi.hoisted(() => ({ light: vi.fn() }));

vi.mock('react-native', () => ({
  View: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
  StyleSheet: { create: (styles: Record<string, unknown>) => styles, absoluteFill: {}, hairlineWidth: 1 },
}));

vi.mock('@boardsesh/board-config', () => ({
  formatBoardDisplayName: (boardType: string) => `Display:${boardType}`,
}));

vi.mock('../../../providers/theme-provider', () => ({
  useTheme: () => ({ systemColors: { secondaryLabel: '#888', separator: '#ccc', elevatedSurface: '#fff' } }),
}));

vi.mock('../../../lib/graphql/use-active-board', () => ({
  useActiveBoard: () => ({ data: ctrl.board }),
}));

vi.mock('../../../hooks/use-native-glass', () => ({ useNativeGlass: () => false }));
vi.mock('../../../lib/haptics', () => ({ hapticLight: haptics.light }));
vi.mock('../../../theme/tokens', () => ({ shadows: { sm: {} } }));
vi.mock('../../../theme/layout', () => ({ glassSize: { capsule: 44 } }));

vi.mock('../../GlassSurface', () => ({ GlassSurface: () => createElement('div', { 'data-glass': 'true' }) }));

type PressMockProps = {
  children?: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
};
vi.mock('../../PressableSurface', () => ({
  PressableSurface: ({ children, onPress, accessibilityLabel, accessibilityHint }: PressMockProps) =>
    createElement(
      'button',
      {
        onClick: onPress,
        'data-hint': accessibilityHint ?? '',
        'data-capsule': accessibilityLabel?.includes('•') ? accessibilityLabel : '',
      },
      children,
    ),
}));

vi.mock('../../Text', () => ({
  Text: ({ children }: { children?: ReactNode }) => createElement('span', null, children),
}));
vi.mock('../../Icon', () => ({ Icon: ({ name }: { name: string }) => createElement('span', { 'data-icon': name }) }));

import { BoardPill } from '../BoardPill';

const capsule = (root: HTMLElement) =>
  root.querySelector('[data-capsule]:not([data-capsule=""])') as HTMLButtonElement | null;

const typedBoard: BoardLabelFields = {
  name: '',
  angle: 40,
  boardType: 'kilter',
  sizeName: 'M',
  layoutName: 'Kilter Layout',
};

describe('BoardPill', () => {
  beforeEach(() => {
    ctrl.board = null;
    haptics.light.mockClear();
  });

  it('renders nothing when there is no active board', () => {
    const { container } = render(createElement(BoardPill, { onPress: vi.fn() }));
    expect(capsule(container)).toBeNull();
  });

  it('renders the board label and fires onPress with a haptic', () => {
    ctrl.board = typedBoard;
    const onPress = vi.fn();
    const { container } = render(createElement(BoardPill, { onPress }));
    const pill = capsule(container);
    expect(pill?.getAttribute('data-capsule')).toBe('Display:kilter • M • 40°');
    fireEvent.click(pill!);
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(haptics.light).toHaveBeenCalledTimes(1);
  });

  it('forwards the accessibility hint', () => {
    ctrl.board = typedBoard;
    const { container } = render(createElement(BoardPill, { onPress: vi.fn(), accessibilityHint: 'Opens switcher' }));
    expect(capsule(container)?.getAttribute('data-hint')).toBe('Opens switcher');
  });
});
