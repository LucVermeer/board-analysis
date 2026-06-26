// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import type { SharedValue } from 'react-native-reanimated';

// Capture the tap / long-press onStart worklets (and the pinch relation) so the
// test can invoke them and assert the per-hold pinch gate without real gestures.
const tapStartCallbacks: (() => void)[] = [];
const longPressStartCallbacks: (() => void)[] = [];
const simultaneousCalls: unknown[] = [];

vi.mock('react-native', () => ({
  View: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
}));

vi.mock('react-native-reanimated', () => ({ runOnJS: (fn: unknown) => fn }));

vi.mock('react-native-gesture-handler', () => {
  const makeGesture = (recordStart: (cb: () => void) => void) => {
    const gesture: Record<string, unknown> = {
      maxDuration: () => gesture,
      maxDistance: () => gesture,
      minDuration: () => gesture,
      onStart: (cb: () => void) => {
        recordStart(cb);
        return gesture;
      },
      simultaneousWithExternalGesture: (ref: unknown) => {
        simultaneousCalls.push(ref);
        return gesture;
      },
    };
    return gesture;
  };
  return {
    Gesture: {
      Tap: () => makeGesture((cb) => tapStartCallbacks.push(cb)),
      LongPress: () => makeGesture((cb) => longPressStartCallbacks.push(cb)),
      Exclusive: (...members: unknown[]) => ({ composed: 'exclusive', members }),
    },
    GestureDetector: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
  };
});

import { HoldTarget } from '../HoldTarget';

function renderHoldTarget(overrides: { isPinchingSV?: SharedValue<boolean> } = {}) {
  tapStartCallbacks.length = 0;
  longPressStartCallbacks.length = 0;
  simultaneousCalls.length = 0;
  const onPaint = vi.fn();
  const onLongPress = vi.fn();
  render(
    <HoldTarget
      holdId={7}
      leftPct={10}
      topPct={20}
      tapDiameter={30}
      dotDiameter={6}
      showDot
      dotColor="#fff"
      onPaint={onPaint}
      onLongPress={onLongPress}
      {...overrides}
    />,
  );
  return { onPaint, onLongPress };
}

describe('HoldTarget', () => {
  it('paints on tap and opens the role sheet on long-press when no pinch is active', () => {
    const { onPaint, onLongPress } = renderHoldTarget({
      isPinchingSV: { value: false } as unknown as SharedValue<boolean>,
    });
    tapStartCallbacks.at(-1)?.();
    longPressStartCallbacks.at(-1)?.();
    expect(onPaint).toHaveBeenCalledWith(7);
    expect(onLongPress).toHaveBeenCalledWith(7);
  });

  it('does not paint or open the role sheet while a pinch is active', () => {
    // tap/long-press are simultaneousWithExternalGesture(pinch), so RNGH no
    // longer fails them when the pinch activates — the gate is what prevents an
    // accidental paint / role-sheet open during a small or slow pinch.
    const { onPaint, onLongPress } = renderHoldTarget({
      isPinchingSV: { value: true } as unknown as SharedValue<boolean>,
    });
    tapStartCallbacks.at(-1)?.();
    longPressStartCallbacks.at(-1)?.();
    expect(onPaint).not.toHaveBeenCalled();
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('still paints when no pinch gate is wired (gate is optional)', () => {
    const { onPaint } = renderHoldTarget();
    tapStartCallbacks.at(-1)?.();
    expect(onPaint).toHaveBeenCalledWith(7);
  });
});
