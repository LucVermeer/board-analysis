// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { SharedValue } from 'react-native-reanimated';
import type { GestureType } from 'react-native-gesture-handler';

// Chainable gesture builder per Gesture.Tap()/LongPress() call. Race tags its
// result so we can assert which branch the hook returned without driving real
// gestures. The builder records simultaneousWithExternalGesture args (to assert
// the pinch relation) and the onStart worklet (to invoke it and assert the
// pinch gate).
type TapEvent = { x: number; y: number };
const raceCalls: unknown[][] = [];
const simultaneousCalls: unknown[] = [];
const tapStartCallbacks: ((event: TapEvent) => void)[] = [];
const longPressStartCallbacks: ((event: TapEvent) => void)[] = [];
vi.mock('react-native-gesture-handler', () => {
  const makeGesture = (recordStart: (cb: (event: TapEvent) => void) => void) => {
    const gesture: Record<string, unknown> = {
      maxDuration: () => gesture,
      maxDistance: () => gesture,
      minDuration: () => gesture,
      onStart: (cb: (event: TapEvent) => void) => {
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
      Race: (...members: unknown[]) => {
        raceCalls.push(members);
        return { composed: 'race', members };
      },
    },
  };
});

vi.mock('react-native-reanimated', () => ({ runOnJS: (fn: unknown) => fn }));

import { useZoomedHoldTapGesture, PAN_ACTIVATION_OFFSET } from '../use-zoomed-hold-tap-gesture';

const sv = (value: number): SharedValue<number> => ({ value }) as SharedValue<number>;
const barePan = { id: 'bare-pan' } as unknown as GestureType;

function baseOptions(overrides: Record<string, unknown> = {}) {
  return {
    zoomPanGesture: barePan,
    scaleSV: sv(1),
    translateXSV: sv(0),
    translateYSV: sv(0),
    containerWidthSV: sv(300),
    containerHeightSV: sv(600),
    hitTargets: [{ holdId: 1, x: 150, y: 300, radius: 24 }],
    ...overrides,
  };
}

describe('useZoomedHoldTapGesture', () => {
  it('exports the default pan activation offset', () => {
    expect(PAN_ACTIVATION_OFFSET).toBe(8);
  });

  it('returns the bare pan unchanged when no onTap (zone mode)', () => {
    const { result } = renderHook(() => useZoomedHoldTapGesture(baseOptions()));
    expect(result.current).toBe(barePan);
  });

  it('composes the pan with tap + long-press (Race, pan first) when onTap is provided', () => {
    raceCalls.length = 0;
    const onTap = vi.fn();
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useZoomedHoldTapGesture(baseOptions({ onTap, onLongPress })));

    expect(result.current).not.toBe(barePan);
    expect((result.current as { composed?: string }).composed).toBe('race');
    // Pan must be the first member so it gets first refusal on movement.
    expect(raceCalls.at(-1)?.[0]).toBe(barePan);
    expect(raceCalls.at(-1)).toHaveLength(3);
  });

  it('keeps the composed gesture stable across re-renders with the same inputs', () => {
    const options = baseOptions({ onTap: vi.fn() });
    const { result, rerender } = renderHook(() => useZoomedHoldTapGesture(options));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it('declares the tap + long-press legs simultaneous with the pinch when pinchRef is provided', () => {
    simultaneousCalls.length = 0;
    const pinchRef = { current: undefined } as unknown as { current: GestureType | undefined };
    renderHook(() => useZoomedHoldTapGesture(baseOptions({ onTap: vi.fn(), onLongPress: vi.fn(), pinchRef })));
    // Both legs must reference the pinch so a re-pinch while zoomed isn't blocked.
    expect(simultaneousCalls.filter((ref) => ref === pinchRef)).toHaveLength(2);
  });

  it('wires no pinch relation when pinchRef is omitted', () => {
    simultaneousCalls.length = 0;
    renderHook(() => useZoomedHoldTapGesture(baseOptions({ onTap: vi.fn(), onLongPress: vi.fn() })));
    expect(simultaneousCalls).toHaveLength(0);
  });

  it('routes tap + long-press to the hold under the point when no pinch is active', () => {
    tapStartCallbacks.length = 0;
    longPressStartCallbacks.length = 0;
    const onTap = vi.fn();
    const onLongPress = vi.fn();
    const isPinchingSV = { value: false } as unknown as SharedValue<boolean>;
    renderHook(() => useZoomedHoldTapGesture(baseOptions({ onTap, onLongPress, isPinchingSV })));

    // scale 1 + no translation → board point == screen point; (150,300) is hold 1.
    tapStartCallbacks.at(-1)?.({ x: 150, y: 300 });
    longPressStartCallbacks.at(-1)?.({ x: 150, y: 300 });
    expect(onTap).toHaveBeenCalledWith(1);
    expect(onLongPress).toHaveBeenCalledWith(1);
  });

  it('bails out of tap + long-press while a pinch is active', () => {
    tapStartCallbacks.length = 0;
    longPressStartCallbacks.length = 0;
    const onTap = vi.fn();
    const onLongPress = vi.fn();
    // A re-pinch while zoomed must not also paint / open the picker — both legs
    // are simultaneous with the pinch, so the gate is the only thing stopping it.
    const isPinchingSV = { value: true } as unknown as SharedValue<boolean>;
    renderHook(() => useZoomedHoldTapGesture(baseOptions({ onTap, onLongPress, isPinchingSV })));

    tapStartCallbacks.at(-1)?.({ x: 150, y: 300 });
    longPressStartCallbacks.at(-1)?.({ x: 150, y: 300 });
    expect(onTap).not.toHaveBeenCalled();
    expect(onLongPress).not.toHaveBeenCalled();
  });
});
