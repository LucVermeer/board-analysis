// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import type { UserBoard } from '@boardsesh/shared-schema';

// Only the board fields ClimbTopChrome reads. A full UserBoard is overkill, so
// the active-board mock returns this narrowed shape (cast at the mock boundary).
type BoardLabelFields = Pick<UserBoard, 'name' | 'angle' | 'boardType' | 'sizeName' | 'layoutName'>;

type BluetoothCtx = {
  isConnected: boolean;
  connect: () => Promise<boolean>;
  disconnect: () => Promise<void>;
} | null;

const ctrl = vi.hoisted(() => ({
  board: null as BoardLabelFields | null,
  bluetooth: null as BluetoothCtx,
}));
const haptics = vi.hoisted(() => ({ light: vi.fn() }));

// View → div that forwards onLayout via a data hook we can trigger, and an
// onPress for the few Views that take one (none here, but kept generic).
type ViewMockProps = {
  children?: ReactNode;
  onLayout?: (event: { nativeEvent: { layout: { height: number } } }) => void;
};
vi.mock('react-native', () => ({
  View: ({ children, onLayout }: ViewMockProps) =>
    createElement(
      'div',
      {
        'data-has-layout': onLayout ? 'true' : 'false',
        // Surface onLayout so a test can simulate a measured height.
        onClick: onLayout ? () => onLayout({ nativeEvent: { layout: { height: 88 } } }) : undefined,
      },
      children,
    ),
  StyleSheet: { create: (styles: Record<string, unknown>) => styles, absoluteFill: {}, hairlineWidth: 1 },
}));

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 0, left: 0, right: 0 }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// Make the board display name distinguishable from a custom board name so the
// named-vs-typed label branch is observable.
vi.mock('@boardsesh/board-config', () => ({
  formatBoardDisplayName: (boardType: string) => `Display:${boardType}`,
}));

vi.mock('../../../providers/theme-provider', () => ({
  useTheme: () => ({
    systemColors: {
      label: '#000',
      fill: '#eee',
      secondaryLabel: '#888',
      separator: '#ccc',
      elevatedSurface: '#fff',
    },
    brandColors: { warning: '#FF9500' },
  }),
}));

vi.mock('../../../lib/graphql/use-active-board', () => ({
  useActiveBoard: () => ({ data: ctrl.board }),
}));

vi.mock('../../../providers/bluetooth-provider', () => ({
  useOptionalBluetoothContext: () => ctrl.bluetooth,
}));

vi.mock('../../../theme/tokens', () => ({
  spacing: { 2: 8, 4: 16 },
  shadows: { sm: {} },
}));

vi.mock('../../../theme/colors', () => ({
  withAlpha: (color: string, alpha: number) => `${color}@${alpha}`,
}));

vi.mock('../../../lib/haptics', () => ({ hapticLight: haptics.light }));

// GlassIconButton → button exposing icon/colors/label so create FAB and the
// lightbulb FAB are individually addressable, with onPress forwarded.
type GlassIconMockProps = {
  iconName?: string;
  iconColor?: string;
  tintColor?: string;
  onPress?: () => void;
  accessibilityLabel?: string;
};
vi.mock('../../GlassIconButton', () => ({
  GlassIconButton: ({ iconName, iconColor, tintColor, onPress, accessibilityLabel }: GlassIconMockProps) =>
    createElement('button', {
      onClick: onPress,
      'data-fab': iconName,
      'data-icon-color': iconColor ?? '',
      'data-tint': tintColor ?? '',
      'data-label': accessibilityLabel ?? '',
    }),
}));

// PressableSurface → button exposing its accessibility label (the board label).
type PressMockProps = {
  children?: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
};
vi.mock('../../PressableSurface', () => ({
  PressableSurface: ({ children, onPress, accessibilityLabel }: PressMockProps) =>
    createElement('button', { onClick: onPress, 'data-capsule': accessibilityLabel ?? '' }, children),
}));

vi.mock('../../GlassSurface', () => ({
  GlassSurface: () => createElement('div', { 'data-glass': 'true' }),
}));

vi.mock('../../Icon', () => ({
  Icon: ({ name }: { name: string }) => createElement('span', { 'data-icon': name }),
}));

vi.mock('../../Text', () => ({
  Text: ({ children }: { children?: ReactNode }) => createElement('span', { 'data-text': 'true' }, children),
}));

import { ClimbTopChrome } from '../ClimbTopChrome';

function makeProps(over: Partial<Parameters<typeof ClimbTopChrome>[0]> = {}) {
  return {
    canCreate: false,
    onCreate: vi.fn(),
    onOpenBoardDetail: vi.fn(),
    onHeightChange: vi.fn(),
    ...over,
  };
}

const createFab = (root: HTMLElement) => root.querySelector('[data-fab="plus"]') as HTMLButtonElement | null;
const lightbulb = (root: HTMLElement) =>
  (root.querySelector('[data-fab="lightbulb"]') ??
    root.querySelector('[data-fab="lightbulb.fill"]')) as HTMLButtonElement | null;
const capsule = (root: HTMLElement) => root.querySelector('[data-capsule]') as HTMLButtonElement | null;

const typedBoard: BoardLabelFields = {
  name: '',
  angle: 40,
  boardType: 'kilter',
  sizeName: '12x12',
  layoutName: 'Kilter Layout',
};
const namedBoard: BoardLabelFields = {
  name: 'Garage Wall',
  angle: 25,
  boardType: 'tension',
  sizeName: '8x10',
  layoutName: 'Tension Layout',
};

describe('ClimbTopChrome', () => {
  beforeEach(() => {
    ctrl.board = null;
    ctrl.bluetooth = null;
    haptics.light.mockClear();
  });

  it('renders no board capsule when there is no active board', () => {
    const { container } = render(<ClimbTopChrome {...makeProps()} />);
    expect(capsule(container)).toBeNull();
  });

  it('builds a typed-board label from display name • size • angle', () => {
    ctrl.board = typedBoard;
    const { container } = render(<ClimbTopChrome {...makeProps()} />);
    // boardType has no custom name → composite: Display:kilter • 12x12 • 40°
    expect(capsule(container)?.getAttribute('data-capsule')).toBe('Display:kilter • 12x12 • 40°');
  });

  it('leads with the custom board name when the board is named', () => {
    ctrl.board = namedBoard;
    const { container } = render(<ClimbTopChrome {...makeProps()} />);
    // Named board → "Garage Wall • 25°" (display name + size are dropped).
    expect(capsule(container)?.getAttribute('data-capsule')).toBe('Garage Wall • 25°');
  });

  it('omits the angle segment when angle is absent', () => {
    ctrl.board = { ...typedBoard, angle: null as unknown as number };
    const { container } = render(<ClimbTopChrome {...makeProps()} />);
    expect(capsule(container)?.getAttribute('data-capsule')).toBe('Display:kilter • 12x12');
  });

  it('hides the create FAB unless canCreate is true', () => {
    ctrl.board = typedBoard;
    const { container, rerender } = render(<ClimbTopChrome {...makeProps({ canCreate: false })} />);
    expect(createFab(container)).toBeNull();
    rerender(<ClimbTopChrome {...makeProps({ canCreate: true })} />);
    expect(createFab(container)).not.toBeNull();
  });

  it('fires onCreate when the create FAB is pressed', () => {
    const onCreate = vi.fn();
    const { container } = render(<ClimbTopChrome {...makeProps({ canCreate: true, onCreate })} />);
    fireEvent.click(createFab(container)!);
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it('fires onOpenBoardDetail (with haptic) when the board capsule is pressed', () => {
    ctrl.board = typedBoard;
    const onOpenBoardDetail = vi.fn();
    const { container } = render(<ClimbTopChrome {...makeProps({ onOpenBoardDetail })} />);
    fireEvent.click(capsule(container)!);
    expect(onOpenBoardDetail).toHaveBeenCalledTimes(1);
    expect(haptics.light).toHaveBeenCalledTimes(1);
  });

  it('renders no lightbulb when there is no bluetooth context', () => {
    ctrl.bluetooth = null;
    const { container } = render(<ClimbTopChrome {...makeProps()} />);
    expect(lightbulb(container)).toBeNull();
  });

  it('shows a disconnected lightbulb (outline icon, neutral color) when not connected', () => {
    ctrl.bluetooth = { isConnected: false, connect: vi.fn().mockResolvedValue(true), disconnect: vi.fn() };
    const { container } = render(<ClimbTopChrome {...makeProps()} />);
    const bulb = lightbulb(container);
    expect(bulb?.getAttribute('data-fab')).toBe('lightbulb');
    // Not connected → neutral label color, no warm tint, connect a11y label.
    expect(bulb?.getAttribute('data-icon-color')).toBe('#000');
    expect(bulb?.getAttribute('data-tint')).toBe('');
    expect(bulb?.getAttribute('data-label')).toBe('ble.connectBoard');
  });

  it('shows a connected lightbulb (filled icon, warm tint) when connected', () => {
    ctrl.bluetooth = { isConnected: true, connect: vi.fn(), disconnect: vi.fn().mockResolvedValue(undefined) };
    const { container } = render(<ClimbTopChrome {...makeProps()} />);
    const bulb = lightbulb(container);
    expect(bulb?.getAttribute('data-fab')).toBe('lightbulb.fill');
    expect(bulb?.getAttribute('data-icon-color')).toBe('#FF9500');
    // withAlpha(warning, 0.2) → warm tint applied only when connected.
    expect(bulb?.getAttribute('data-tint')).toBe('#FF9500@0.2');
    expect(bulb?.getAttribute('data-label')).toBe('lightControl.disconnect');
  });

  it('connects on lightbulb press when disconnected', () => {
    const connect = vi.fn().mockResolvedValue(true);
    const disconnect = vi.fn().mockResolvedValue(undefined);
    ctrl.bluetooth = { isConnected: false, connect, disconnect };
    const { container } = render(<ClimbTopChrome {...makeProps()} />);
    fireEvent.click(lightbulb(container)!);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(disconnect).not.toHaveBeenCalled();
    expect(haptics.light).toHaveBeenCalledTimes(1);
  });

  it('disconnects on lightbulb press when connected', () => {
    const connect = vi.fn().mockResolvedValue(true);
    const disconnect = vi.fn().mockResolvedValue(undefined);
    ctrl.bluetooth = { isConnected: true, connect, disconnect };
    const { container } = render(<ClimbTopChrome {...makeProps()} />);
    fireEvent.click(lightbulb(container)!);
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(connect).not.toHaveBeenCalled();
  });

  it('reports its measured height through onHeightChange via onLayout', () => {
    const onHeightChange = vi.fn();
    const { container } = render(<ClimbTopChrome {...makeProps({ onHeightChange })} />);
    // The outer container View is the only one wired with onLayout.
    const layoutView = container.querySelector('[data-has-layout="true"]') as HTMLElement;
    expect(layoutView).not.toBeNull();
    fireEvent.click(layoutView);
    expect(onHeightChange).toHaveBeenCalledWith(88);
  });
});
