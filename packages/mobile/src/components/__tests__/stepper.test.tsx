// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';

type AccessibilityAction = (event: { nativeEvent: { actionName: string } }) => void;

vi.mock('react-native', () => ({
  // The outer (adjustable) View carries onAccessibilityAction — stash it on the DOM
  // node so a test can invoke the VoiceOver/TalkBack swipe handler directly (jsdom
  // has no native accessibility-action event).
  View: ({
    children,
    accessibilityRole,
    onAccessibilityAction,
  }: {
    children?: ReactNode;
    accessibilityRole?: string;
    onAccessibilityAction?: AccessibilityAction;
  }) =>
    createElement(
      'div',
      {
        'data-testid': accessibilityRole === 'adjustable' ? 'stepper-adjustable' : undefined,
        ref: onAccessibilityAction
          ? (node: (HTMLDivElement & { onAccessibilityAction?: AccessibilityAction }) | null) => {
              if (node) node.onAccessibilityAction = onAccessibilityAction;
            }
          : undefined,
      },
      children,
    ),
  StyleSheet: { create: (styles: Record<string, unknown>) => styles, hairlineWidth: 1 },
}));

vi.mock('../../providers/theme-provider', () => ({
  useTheme: () => ({
    systemColors: { label: '#000', separator: '#ccc', tertiaryBackground: '#eee', tertiaryLabel: '#aaa' },
    brandColors: { primary: '#6D28D9' },
    opacity: { disabled: 0.5 },
    variant: 'liquidGlass',
  }),
}));
vi.mock('../../theme/tokens', () => ({ spacing: { 2: 8, 3: 12, 4: 16 }, borderRadius: { full: 9999 } }));
vi.mock('../../lib/haptics', () => ({ hapticSelection: vi.fn() }));

vi.mock('../Text', () => ({
  Text: ({ children }: { children?: ReactNode }) => createElement('span', null, children),
}));
vi.mock('../Icon', () => ({ Icon: ({ name }: { name: string }) => createElement('span', { 'data-icon': name }) }));
// The real component steps on press-IN and repeats while held, so the stub forwards
// onPressIn → onMouseDown and onPressOut → onMouseUp, dropping both when disabled
// (matching the native Pressable, which ignores presses while disabled).
vi.mock('../PressableSurface', () => ({
  PressableSurface: ({
    children,
    onPressIn,
    onPressOut,
    disabled,
    testID,
  }: {
    children?: ReactNode;
    onPressIn?: () => void;
    onPressOut?: () => void;
    disabled?: boolean;
    testID?: string;
  }) =>
    createElement(
      'button',
      {
        onMouseDown: disabled ? undefined : onPressIn,
        onMouseUp: disabled ? undefined : onPressOut,
        disabled: disabled ?? false,
        'data-testid': testID ?? '',
      },
      children,
    ),
}));

import { Stepper } from '../Stepper';

function makeProps(over: Partial<Parameters<typeof Stepper>[0]> = {}) {
  return { label: 'Number of climbs', value: 5, min: 1, max: 10, onChange: vi.fn(), ...over };
}

const decrement = (root: HTMLElement) => root.querySelector('[data-testid="stepper-decrement"]') as HTMLButtonElement;
const increment = (root: HTMLElement) => root.querySelector('[data-testid="stepper-increment"]') as HTMLButtonElement;
const adjustable = (root: HTMLElement) =>
  root.querySelector('[data-testid="stepper-adjustable"]') as HTMLElement & {
    onAccessibilityAction: AccessibilityAction;
  };

afterEach(() => {
  vi.useRealTimers();
});

describe('Stepper', () => {
  it('reports value+1 when increment is tapped', () => {
    const onChange = vi.fn();
    const { container } = render(<Stepper {...makeProps({ value: 5, onChange })} />);
    fireEvent.mouseDown(increment(container));
    expect(onChange).toHaveBeenCalledWith(6);
  });

  it('reports value-1 when decrement is tapped', () => {
    const onChange = vi.fn();
    const { container } = render(<Stepper {...makeProps({ value: 5, onChange })} />);
    fireEvent.mouseDown(decrement(container));
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it('disables increment and does not report at the max', () => {
    const onChange = vi.fn();
    const { container } = render(<Stepper {...makeProps({ value: 10, max: 10, onChange })} />);
    expect(increment(container).disabled).toBe(true);
    fireEvent.mouseDown(increment(container));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('disables decrement and does not report at the min', () => {
    const onChange = vi.fn();
    const { container } = render(<Stepper {...makeProps({ value: 1, min: 1, onChange })} />);
    expect(decrement(container).disabled).toBe(true);
    fireEvent.mouseDown(decrement(container));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('clamps a tap that lands exactly on the max', () => {
    const onChange = vi.fn();
    const { container } = render(<Stepper {...makeProps({ value: 9, max: 10, onChange })} />);
    fireEvent.mouseDown(increment(container));
    expect(onChange).toHaveBeenCalledWith(10);
  });

  it('repeats while held, then stops on release', () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const { container } = render(<Stepper {...makeProps({ value: 5, max: 50, onChange })} />);
    // touch-down fires one immediate step
    fireEvent.mouseDown(increment(container));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(6);
    // holding past the initial delay fires additional, increasing steps
    vi.advanceTimersByTime(1000);
    const heldCalls = onChange.mock.calls.length;
    expect(heldCalls).toBeGreaterThan(1);
    expect(onChange.mock.calls.at(-1)?.[0]).toBeGreaterThan(6);
    // releasing stops the repeat
    fireEvent.mouseUp(increment(container));
    vi.advanceTimersByTime(3000);
    expect(onChange).toHaveBeenCalledTimes(heldCalls);
  });

  it('steps via the accessibility increment / decrement actions', () => {
    const onChange = vi.fn();
    const { container } = render(<Stepper {...makeProps({ value: 5, onChange })} />);
    adjustable(container).onAccessibilityAction({ nativeEvent: { actionName: 'increment' } });
    expect(onChange).toHaveBeenLastCalledWith(6);
    // optimistic ref: a following decrement steps from 6 → 5
    adjustable(container).onAccessibilityAction({ nativeEvent: { actionName: 'decrement' } });
    expect(onChange).toHaveBeenLastCalledWith(5);
  });

  it('ignores an unrecognized accessibility action', () => {
    const onChange = vi.fn();
    const { container } = render(<Stepper {...makeProps({ value: 5, onChange })} />);
    adjustable(container).onAccessibilityAction({ nativeEvent: { actionName: 'magic-tap' } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('cancels a running hold when the opposite button is pressed (no orphaned timer)', () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const { container } = render(<Stepper {...makeProps({ value: 20, min: 1, max: 50, onChange })} />);
    // Hold increment for a moment so its repeat timer is running...
    fireEvent.mouseDown(increment(container));
    vi.advanceTimersByTime(500);
    expect(onChange.mock.calls.length).toBeGreaterThanOrEqual(1);
    // ...then press the opposite button (second finger) and release it. The new
    // hold must cancel the increment loop so nothing keeps oscillating forever.
    fireEvent.mouseDown(decrement(container));
    fireEvent.mouseUp(decrement(container));
    const settledCalls = onChange.mock.calls.length;
    vi.advanceTimersByTime(5000);
    expect(onChange).toHaveBeenCalledTimes(settledCalls);
  });

  it('stops the hold-repeat at the max without overshooting', () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const { container } = render(<Stepper {...makeProps({ value: 8, max: 10, onChange })} />);
    fireEvent.mouseDown(increment(container));
    vi.advanceTimersByTime(5000);
    expect(onChange).toHaveBeenLastCalledWith(10);
    expect(onChange.mock.calls.every(([reported]) => reported <= 10)).toBe(true);
  });
});
