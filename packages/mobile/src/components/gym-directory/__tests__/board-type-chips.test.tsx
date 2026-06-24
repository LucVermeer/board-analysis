// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';

type Children = { children?: ReactNode };
type PressProps = { children?: ReactNode; onPress?: () => void; accessibilityLabel?: string };

const hapticSelection = vi.fn();

vi.mock('@boardsesh/board-config', () => ({
  SUPPORTED_BOARDS: ['kilter', 'tension', 'moonboard'],
  formatBoardDisplayName: (boardType: string) => boardType.charAt(0).toUpperCase() + boardType.slice(1),
}));

vi.mock('react-native', () => ({
  Pressable: ({ children, onPress, accessibilityLabel }: PressProps) =>
    createElement('button', { onClick: onPress, type: 'button', 'aria-label': accessibilityLabel }, children),
  ScrollView: ({ children }: Children) => createElement('div', null, children),
  StyleSheet: { create: (styles: Record<string, unknown>) => styles },
}));

vi.mock('react-native-reanimated', () => ({
  default: { createAnimatedComponent: (component: unknown) => component },
  useAnimatedStyle: () => ({}),
  useSharedValue: (value: number) => ({ value }),
  withSpring: (value: number) => value,
}));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

vi.mock('../../Text', () => ({ Text: ({ children }: Children) => createElement('span', null, children) }));
vi.mock('../../../theme/tokens', () => ({ spacing: { 2: 8, 3: 12 } }));
vi.mock('../../../theme/animations', () => ({ springs: { snappy: {} } }));
vi.mock('../../../lib/haptics', () => ({ hapticSelection: () => hapticSelection() }));
vi.mock('../../../providers/theme-provider', () => ({
  useTheme: () => ({ brandColors: { primary: '#6D28D9' }, systemColors: { separator: '#ccc' } }),
}));

import { BoardTypeChips } from '../BoardTypeChips';

beforeEach(() => hapticSelection.mockClear());

describe('BoardTypeChips', () => {
  it('renders a chip per supported board', () => {
    const { getByText } = render(<BoardTypeChips selected={[]} onToggle={vi.fn()} onClear={vi.fn()} />);
    expect(getByText('Kilter')).toBeTruthy();
    expect(getByText('Tension')).toBeTruthy();
    expect(getByText('Moonboard')).toBeTruthy();
  });

  it('toggles a board type (with a haptic) when its chip is tapped', () => {
    const onToggle = vi.fn();
    const { getByLabelText } = render(<BoardTypeChips selected={[]} onToggle={onToggle} onClear={vi.fn()} />);
    fireEvent.click(getByLabelText('Tension'));
    expect(onToggle).toHaveBeenCalledWith('tension');
    expect(hapticSelection).toHaveBeenCalledTimes(1);
  });

  it('hides Clear when nothing is selected and shows it once a type is active', () => {
    const { queryByText, rerender, getByText } = render(
      <BoardTypeChips selected={[]} onToggle={vi.fn()} onClear={vi.fn()} />,
    );
    expect(queryByText('clear')).toBeNull();
    rerender(<BoardTypeChips selected={['kilter']} onToggle={vi.fn()} onClear={vi.fn()} />);
    expect(getByText('clear')).toBeTruthy();
  });

  it('calls onClear when Clear is tapped', () => {
    const onClear = vi.fn();
    const { getByText } = render(<BoardTypeChips selected={['kilter']} onToggle={vi.fn()} onClear={onClear} />);
    fireEvent.click(getByText('clear'));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
