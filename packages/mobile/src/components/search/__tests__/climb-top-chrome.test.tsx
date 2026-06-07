// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createElement, forwardRef, useImperativeHandle, type ReactNode, type RefObject } from 'react';
import type { UserBoard } from '@boardsesh/shared-schema';
import type { SearchHeaderHandle } from '../../SearchHeader';

type BoardLabelFields = Pick<
  UserBoard,
  'name' | 'angle' | 'boardType' | 'sizeName' | 'layoutName' | 'layoutId' | 'isAngleAdjustable'
>;

type BluetoothCtx = {
  isConnected: boolean;
  connect: () => Promise<boolean>;
  disconnect: () => Promise<void>;
} | null;

const ctrl = vi.hoisted(() => ({
  board: null as BoardLabelFields | null,
  bluetooth: null as BluetoothCtx,
  setActiveBoard: vi.fn(),
}));
const haptics = vi.hoisted(() => ({ light: vi.fn(), selection: vi.fn() }));

type ViewMockProps = {
  children?: ReactNode;
  onLayout?: (event: { nativeEvent: { layout: { height: number } } }) => void;
};
vi.mock('react-native', () => ({
  Keyboard: { dismiss: vi.fn() },
  Pressable: ({ children, onPress }: { children?: ReactNode; onPress?: () => void }) =>
    createElement('button', { onClick: onPress, 'data-scrim': 'true' }, children),
  View: ({ children, onLayout }: ViewMockProps) =>
    createElement(
      'div',
      {
        'data-has-layout': onLayout ? 'true' : 'false',
        onClick: onLayout ? () => onLayout({ nativeEvent: { layout: { height: 88 } } }) : undefined,
      },
      children,
    ),
  StyleSheet: { create: (styles: Record<string, unknown>) => styles, absoluteFill: {}, hairlineWidth: 1 },
}));

vi.mock('react-native-reanimated', () => ({
  default: { View: ({ children }: { children?: ReactNode }) => createElement('div', null, children) },
  FadeIn: { duration: () => ({}) },
  FadeOut: { duration: () => ({}) },
}));

vi.mock('expo-router', () => ({ useFocusEffect: () => {} }));
vi.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children?: ReactNode }) =>
    createElement('div', { 'data-gradient': 'true' }, children),
}));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 0, left: 0, right: 0 }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@boardsesh/board-config', () => ({
  formatBoardDisplayName: (boardType: string) => `Display:${boardType}`,
}));

vi.mock('@boardsesh/board-constants/grade-colors', () => ({
  getGradeColor: () => '#123456',
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
    brandColors: { primary: '#8C4A52', warning: '#FF9500' },
  }),
}));

vi.mock('../../../lib/graphql/use-active-board', () => ({
  useActiveBoard: () => ({ data: ctrl.board }),
  useSetActiveBoard: () => ctrl.setActiveBoard,
}));

vi.mock('../../../providers/bluetooth-provider', () => ({
  useOptionalBluetoothContext: () => ctrl.bluetooth,
}));

vi.mock('../../../theme/tokens', () => ({
  spacing: { 1: 4, 2: 8, 4: 16 },
  shadows: { sm: {} },
}));

vi.mock('../../../theme/layout', () => ({
  glassSize: { standard: 48, capsule: 44 },
}));

vi.mock('../../../theme/colors', () => ({
  withAlpha: (color: string, alpha: number) => `${color}@${alpha}`,
}));

vi.mock('../../../theme/ios-colors', () => ({ iosSystemColors: { white: '#fff' } }));
vi.mock('../../../hooks/use-native-glass', () => ({ useNativeGlass: () => false }));
vi.mock('../../../hooks/use-reduce-motion', () => ({ useReduceMotion: () => true }));
vi.mock('../../../hooks/use-grade-format', () => ({
  useGradeFormat: () => ({ formatGrade: (grade: string) => grade }),
}));
vi.mock('../../../lib/haptics', () => ({ hapticLight: haptics.light, hapticSelection: haptics.selection }));

type PressMockProps = {
  children?: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
};
vi.mock('../../PressableSurface', () => ({
  PressableSurface: ({ children, onPress, onLongPress, accessibilityLabel, accessibilityHint }: PressMockProps) =>
    createElement(
      'button',
      {
        onClick: onPress,
        onDoubleClick: onLongPress,
        'data-pressable': accessibilityLabel ?? '',
        'data-hint': accessibilityHint ?? '',
        'data-capsule': accessibilityLabel?.includes('•') ? accessibilityLabel : '',
      },
      children,
    ),
}));

vi.mock('../../GlassSurface', () => ({
  GlassSurface: () => createElement('div', { 'data-glass': 'true' }),
}));

vi.mock('../../GlassCluster', () => ({
  GlassCluster: ({ children }: { children?: ReactNode }) =>
    createElement('div', { 'data-glass-cluster': 'true' }, children),
}));

vi.mock('../../Icon', () => ({
  Icon: ({ name }: { name: string }) => createElement('span', { 'data-icon': name }),
}));

vi.mock('../../Text', () => ({
  Text: ({ children }: { children?: ReactNode }) => createElement('span', { 'data-text': 'true' }, children),
}));

type SearchHeaderMockProps = {
  placeholder?: string;
  initialValue?: string;
  onChangeText?: (text: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
};
vi.mock('../../SearchHeader', () => ({
  SearchHeader: forwardRef<SearchHeaderHandle, SearchHeaderMockProps>(function SearchHeaderMock(props, ref) {
    useImperativeHandle(ref, () => ({
      blur: () => props.onBlur?.(),
      focus: () => props.onFocus?.(),
      getText: () => props.initialValue ?? '',
      setText: (text: string) => props.onChangeText?.(text),
    }));
    return createElement('input', {
      'data-search-field': 'true',
      'data-placeholder': props.placeholder ?? '',
      onFocus: props.onFocus,
      onBlur: props.onBlur,
    });
  }),
}));

vi.mock('../../grade', () => ({ GradeRangeRail: () => createElement('div', { 'data-grade-rail': 'true' }) }));

type AngleSelectorMockProps = {
  visible: boolean;
  onClose: () => void;
  boardName: string;
  layoutId: number;
  currentAngle: number;
  onAngleChange: (angle: number) => void;
};
vi.mock('../../play-drawer/AngleSelectorSheet', () => ({
  AngleSelectorSheet: ({
    visible,
    onClose,
    boardName,
    layoutId,
    currentAngle,
    onAngleChange,
  }: AngleSelectorMockProps) =>
    visible
      ? createElement(
          'button',
          {
            onClick: () => {
              onAngleChange(45);
              onClose();
            },
            'data-angle-selector': `${boardName}:${layoutId}:${currentAngle}`,
          },
          'Angle selector',
        )
      : null,
}));

import { ClimbTopChrome } from '../ClimbTopChrome';

function makeProps(over: Partial<Parameters<typeof ClimbTopChrome>[0]> = {}) {
  return {
    canCreate: false,
    onCreate: vi.fn(),
    onOpenBoardDetail: vi.fn(),
    onHeightChange: vi.fn(),
    searchFieldRef: { current: null } as RefObject<SearchHeaderHandle | null>,
    searchInitialValue: '',
    searchPlaceholder: 'Search climbs',
    onSearchChange: vi.fn(),
    onSearchFocus: vi.fn(),
    onSearchBlur: vi.fn(),
    onCloseGrade: vi.fn(),
    ...over,
  };
}

const createAction = (root: HTMLElement) =>
  root.querySelector('[data-pressable="mobile.create.fab.ariaLabel"]') as HTMLButtonElement | null;
const angleAction = (root: HTMLElement) =>
  root.querySelector('[data-pressable="mobile.angleSelector.title"]') as HTMLButtonElement | null;
const lightbulb = (root: HTMLElement) =>
  (root.querySelector('[data-pressable="ble.connectBoard"]') ??
    root.querySelector('[data-pressable="lightControl.disconnect"]')) as HTMLButtonElement | null;
const capsule = (root: HTMLElement) =>
  root.querySelector('[data-capsule]:not([data-capsule=""])') as HTMLButtonElement | null;

const typedBoard: BoardLabelFields = {
  name: '',
  angle: 40,
  boardType: 'kilter',
  sizeName: '12x12',
  layoutName: 'Kilter Layout',
  layoutId: 1,
  isAngleAdjustable: true,
};
const namedBoard: BoardLabelFields = {
  name: 'Garage Wall',
  angle: 25,
  boardType: 'tension',
  sizeName: '8x10',
  layoutName: 'Tension Layout',
  layoutId: 2,
  isAngleAdjustable: true,
};

describe('ClimbTopChrome', () => {
  beforeEach(() => {
    ctrl.board = null;
    ctrl.bluetooth = null;
    ctrl.setActiveBoard.mockClear();
    haptics.light.mockClear();
    haptics.selection.mockClear();
  });

  it('renders no board capsule when there is no active board', () => {
    const { container } = render(<ClimbTopChrome {...makeProps()} />);
    expect(capsule(container)).toBeNull();
  });

  it('builds a typed-board label from display name, size, and angle', () => {
    ctrl.board = typedBoard;
    const { container } = render(<ClimbTopChrome {...makeProps()} />);
    expect(capsule(container)?.getAttribute('data-capsule')).toBe('Display:kilter • 12x12 • 40°');
  });

  it('leads with the custom board name when the board is named', () => {
    ctrl.board = namedBoard;
    const { container } = render(<ClimbTopChrome {...makeProps()} />);
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
    expect(createAction(container)).toBeNull();
    rerender(<ClimbTopChrome {...makeProps({ canCreate: true })} />);
    expect(createAction(container)).not.toBeNull();
  });

  it('fires onCreate when the create FAB is pressed', () => {
    const onCreate = vi.fn();
    const { container } = render(<ClimbTopChrome {...makeProps({ canCreate: true, onCreate })} />);
    fireEvent.click(createAction(container)!);
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it('renders the angle selector as the second left toolbar button', () => {
    ctrl.board = typedBoard;
    const { container } = render(<ClimbTopChrome {...makeProps({ canCreate: true })} />);
    expect(angleAction(container)).not.toBeNull();
    expect(angleAction(container)?.textContent).toBe('40°');
  });

  it('hides the angle selector for fixed-angle boards', () => {
    ctrl.board = { ...typedBoard, isAngleAdjustable: false };
    const { container } = render(<ClimbTopChrome {...makeProps({ canCreate: true })} />);
    expect(angleAction(container)).toBeNull();
  });

  it('opens the angle sheet and persists the selected angle', () => {
    ctrl.board = typedBoard;
    const { container } = render(<ClimbTopChrome {...makeProps()} />);
    fireEvent.click(angleAction(container)!);
    expect(haptics.light).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-angle-selector]')?.getAttribute('data-angle-selector')).toBe('kilter:1:40');
    fireEvent.click(container.querySelector('[data-angle-selector]') as HTMLButtonElement);
    expect(ctrl.setActiveBoard).toHaveBeenCalledWith({ ...typedBoard, angle: 45 });
  });

  it('fires onOpenBoardDetail with haptic when the board capsule is pressed', () => {
    ctrl.board = typedBoard;
    const onOpenBoardDetail = vi.fn();
    const { container } = render(<ClimbTopChrome {...makeProps({ onOpenBoardDetail })} />);
    fireEvent.click(capsule(container)!);
    expect(onOpenBoardDetail).toHaveBeenCalledTimes(1);
    expect(haptics.light).toHaveBeenCalledTimes(1);
  });

  it('renders the custom search field without top-row filter chrome', () => {
    const { container } = render(<ClimbTopChrome {...makeProps()} />);
    expect(lightbulb(container)).toBeNull();
    expect(container.querySelector('[data-search-field]')).not.toBeNull();
    expect(container.querySelector('[data-pressable^="mobile.search.filters"]')).toBeNull();
  });

  it('native search mode leaves text search in the stack header and does not render filter chrome', () => {
    const { container } = render(<ClimbTopChrome {...makeProps({ searchMode: 'native' })} />);
    expect(container.querySelector('[data-search-field]')).toBeNull();
    expect(container.querySelector('[data-gradepill]')).toBeNull();
    expect(container.querySelector('[data-pressable^="mobile.search.filters"]')).toBeNull();
  });

  it('shows a disconnected lightbulb when not connected', () => {
    ctrl.bluetooth = { isConnected: false, connect: vi.fn().mockResolvedValue(true), disconnect: vi.fn() };
    const { container } = render(<ClimbTopChrome {...makeProps()} />);
    expect(lightbulb(container)).not.toBeNull();
    expect(container.querySelector('[data-icon="lightbulb"]')).not.toBeNull();
  });

  it('shows a connected lightbulb when connected', () => {
    ctrl.bluetooth = { isConnected: true, connect: vi.fn(), disconnect: vi.fn().mockResolvedValue(undefined) };
    const { container } = render(<ClimbTopChrome {...makeProps()} />);
    expect(lightbulb(container)).not.toBeNull();
    expect(container.querySelector('[data-icon="lightbulb.fill"]')).not.toBeNull();
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
    const layoutView = container.querySelector('[data-has-layout="true"]') as HTMLElement;
    expect(layoutView).not.toBeNull();
    fireEvent.click(layoutView);
    expect(onHeightChange).toHaveBeenCalledWith(88);
  });
});
