// @vitest-environment jsdom
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { LayoutChangeEvent, ViewStyle } from 'react-native';

const platformMock = vi.hoisted(() => ({ OS: 'ios' as 'ios' | 'android', Version: '26.1' as string }));
const absoluteFill = vi.hoisted(() => ({ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }));

vi.mock('react-native', () => ({
  Platform: platformMock,
  StyleSheet: { create: (styles: Record<string, unknown>) => styles, absoluteFill },
  useWindowDimensions: () => ({ width: 375, height: 667 }),
}));

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 20, bottom: 0, left: 0, right: 0 }),
}));

import { useSheetDetentProbe } from '../sheet-detent-probe';
import { useSheetColumnStyle } from '../use-sheet-column-style';

// A layout event carrying only the fields the probe reads.
function layout({ height = 0, y = 0 }: { height?: number; y?: number }): LayoutChangeEvent {
  return { nativeEvent: { layout: { x: 0, y, width: 375, height } } } as LayoutChangeEvent;
}

const FIXED_COLUMN: ViewStyle = { height: 541 };
const FLEX_COLUMN: ViewStyle = { flex: 1 };

let logSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  platformMock.OS = 'ios';
  platformMock.Version = '26.1';
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  logSpy.mockRestore();
});

describe('useSheetDetentProbe — wiring', () => {
  it('hands back an absolute-fill probe and a zero-height sentinel for a fixed-height column', () => {
    const { result } = renderHook(() => useSheetDetentProbe(FIXED_COLUMN, 'Sheet'));
    // The probe must not be able to swallow a tap on the sheet's content.
    expect(result.current.probeProps?.pointerEvents).toBe('none');
    expect(result.current.probeProps?.style).toBe(absoluteFill);
    // Zero height keeps the sentinel out of the wrapper's content size, so it
    // cannot move the layout it exists to measure.
    expect(result.current.sentinelProps?.style).toEqual({ height: 0 });
    expect(result.current.onColumnLayout).toBeTypeOf('function');
  });

  it('stays idle for a flex column (Android / dynamic sizing / non-% detents)', () => {
    const { result } = renderHook(() => useSheetDetentProbe(FLEX_COLUMN, 'Sheet'));
    expect(result.current.probeProps).toBeNull();
    expect(result.current.sentinelProps).toBeNull();
    expect(result.current.onColumnLayout).toBeUndefined();
  });

  it('keeps callback identity stable so the probe views never remount', () => {
    const { result, rerender } = renderHook(() => useSheetDetentProbe(FIXED_COLUMN, 'Sheet'));
    const first = result.current;
    rerender();
    expect(result.current.probeProps).toBe(first.probeProps);
    expect(result.current.sentinelProps).toBe(first.sentinelProps);
    expect(result.current.onColumnLayout).toBe(first.onColumnLayout);
  });
});

describe('useSheetDetentProbe — logging', () => {
  it('logs once, only after all three measurements have arrived', () => {
    const { result } = renderHook(() => useSheetDetentProbe(FIXED_COLUMN, 'ClimbFilterSheet'));
    const { probeProps, sentinelProps, onColumnLayout } = result.current;

    probeProps?.onLayout(layout({ height: 548 }));
    expect(logSpy).not.toHaveBeenCalled();
    sentinelProps?.onLayout(layout({ y: 16 }));
    expect(logSpy).not.toHaveBeenCalled();

    onColumnLayout?.(layout({ height: 390 }));
    expect(logSpy).toHaveBeenCalledTimes(1);

    const [tag, payload] = logSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(tag).toContain('#3922');
    expect(payload).toMatchObject({
      sheet: 'ClimbFilterSheet',
      window: { width: 375, height: 667 },
      insets: { top: 20, bottom: 0 },
      formulaHeight: 541,
      probeHeight: 548,
      columnHeight: 390,
      sentinelY: 16,
    });
  });

  it('reports the in-flow height as probe minus the measured padding, not probe alone', () => {
    // The distinction that killed the first fix attempt: an absolutely
    // positioned child resolves against its containing block's PADDING box, so
    // the probe reads one paddingTop LONG. Verified against yoga-layout@3.2.1
    // on @expo/ui's wrapper subtree: setViewSize 548 + paddingTop 16 gives
    // probe=548 while the in-flow column receives 532.
    const { result } = renderHook(() => useSheetDetentProbe(FIXED_COLUMN, 'Sheet'));
    result.current.probeProps?.onLayout(layout({ height: 548 }));
    result.current.sentinelProps?.onLayout(layout({ y: 16 }));
    result.current.onColumnLayout?.(layout({ height: 541 }));

    const [, payload] = logSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(payload.availableInFlowHeight).toBe(532);
    expect(payload.availableInFlowHeight).not.toBe(payload.probeHeight);
  });

  it('does not log again once an epoch has been reported', () => {
    const { result } = renderHook(() => useSheetDetentProbe(FIXED_COLUMN, 'Sheet'));
    const { probeProps, sentinelProps, onColumnLayout } = result.current;
    probeProps?.onLayout(layout({ height: 548 }));
    sentinelProps?.onLayout(layout({ y: 16 }));
    onColumnLayout?.(layout({ height: 541 }));
    expect(logSpy).toHaveBeenCalledTimes(1);

    // A settle animation or keyboard resize re-fires layout on the same detent.
    probeProps?.onLayout(layout({ height: 548 }));
    onColumnLayout?.(layout({ height: 541 }));
    expect(logSpy).toHaveBeenCalledTimes(1);
  });

  it('starts a fresh epoch when the detent height changes, without mixing readings', () => {
    const { result, rerender } = renderHook(({ style }) => useSheetDetentProbe(style, 'Sheet'), {
      initialProps: { style: FIXED_COLUMN },
    });
    result.current.probeProps?.onLayout(layout({ height: 548 }));
    result.current.sentinelProps?.onLayout(layout({ y: 16 }));
    result.current.onColumnLayout?.(layout({ height: 541 }));
    expect(logSpy).toHaveBeenCalledTimes(1);

    // Drag to a taller detent: the formula height changes, so the previous
    // epoch's probe/sentinel readings must not be reused.
    rerender({ style: { height: 300 } as ViewStyle });
    result.current.onColumnLayout?.(layout({ height: 300 }));
    expect(logSpy).toHaveBeenCalledTimes(1);

    result.current.probeProps?.onLayout(layout({ height: 307 }));
    result.current.sentinelProps?.onLayout(layout({ y: 16 }));
    expect(logSpy).toHaveBeenCalledTimes(2);
    const [, payload] = logSpy.mock.calls[1] as [string, Record<string, unknown>];
    expect(payload).toMatchObject({ formulaHeight: 300, probeHeight: 307, columnHeight: 300 });
  });
});

describe('detent instrumentation gate', () => {
  // @expo/ui's BottomSheet.ios.tsx picks its layout branch with this expression;
  // Sheet.tsx passes `undefined` snap points whenever dynamic sizing is on.
  function expoFitToContents(enableDynamicSizing: boolean, snapPoints: string[] | undefined): boolean {
    const forwarded = enableDynamicSizing ? undefined : snapPoints;
    return enableDynamicSizing && (!forwarded || forwarded.length === 0);
  }

  it('never bounds the column while @expo/ui is measuring content height', () => {
    // The hook gates on enableDynamicSizing alone while @expo/ui uses a compound
    // condition. They agree today only because of how Sheet.tsx forwards snap
    // points — pin it, so a change to either side fails here instead of on a device.
    for (const enableDynamicSizing of [true, false]) {
      for (const snapPoints of [undefined, [], ['90%'], ['48%', '80%']]) {
        const { result } = renderHook(() => useSheetColumnStyle(snapPoints, { enableDynamicSizing }));
        const bounded = typeof (result.current as ViewStyle).height === 'number';
        if (bounded) {
          expect(expoFitToContents(enableDynamicSizing, snapPoints)).toBe(false);
        }
      }
    }
  });

  it('instruments exactly the sheets the column bound applies to', () => {
    const bounded = renderHook(() => useSheetColumnStyle(['90%'], { enableDynamicSizing: false }));
    const unbounded = renderHook(() => useSheetColumnStyle(['90%'], { enableDynamicSizing: true }));

    const withBound = renderHook(() => useSheetDetentProbe(bounded.result.current, 'Sheet'));
    const withoutBound = renderHook(() => useSheetDetentProbe(unbounded.result.current, 'Sheet'));

    expect(withBound.result.current.probeProps).not.toBeNull();
    expect(withoutBound.result.current.probeProps).toBeNull();
  });
});
