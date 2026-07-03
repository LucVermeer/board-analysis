// @vitest-environment jsdom
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

// Mutable so a test can flip the platform; reset to ios in beforeEach.
const platformMock = vi.hoisted(() => ({ OS: 'ios' as 'ios' | 'android' }));

vi.mock('react-native', () => ({
  Platform: platformMock,
  StyleSheet: { create: (styles: Record<string, unknown>) => styles },
  useWindowDimensions: () => ({ width: 390, height: 844 }),
}));

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));

import { useSheetColumnStyle } from '../use-sheet-column-style';

// window 844 − top inset 44 = 800 usable; minus the 20pt chrome margin.
const FILL = { flex: 1 };

beforeEach(() => {
  platformMock.OS = 'ios';
});

describe('useSheetColumnStyle', () => {
  it('bounds an iOS % detent to (window − topInset) × fraction − chrome', () => {
    const { result } = renderHook(() => useSheetColumnStyle(['90%']));
    // round(800 × 0.9) − 20 = 700
    expect(result.current).toEqual({ height: 700 });
  });

  it('bounds an iOS px detent to the literal height − chrome', () => {
    const { result } = renderHook(() => useSheetColumnStyle([500]));
    expect(result.current).toEqual({ height: 480 });
  });

  it('selects the active detent among multiple % snap points', () => {
    const { result: shorter } = renderHook(() => useSheetColumnStyle(['50%', '90%'], { activeIndex: 0 }));
    const { result: taller } = renderHook(() => useSheetColumnStyle(['50%', '90%'], { activeIndex: 1 }));
    // round(800 × 0.5) − 20 = 380 ; round(800 × 0.9) − 20 = 700
    expect(shorter.current).toEqual({ height: 380 });
    expect(taller.current).toEqual({ height: 700 });
  });

  it('clamps activeIndex into range (over and under)', () => {
    const { result: over } = renderHook(() => useSheetColumnStyle(['50%', '90%'], { activeIndex: 9 }));
    const { result: under } = renderHook(() => useSheetColumnStyle(['50%', '90%'], { activeIndex: -3 }));
    expect(over.current).toEqual({ height: 700 }); // clamped to last (90%)
    expect(under.current).toEqual({ height: 380 }); // clamped to first (50%)
  });

  it('falls through to flex for a non-% string detent', () => {
    const { result } = renderHook(() => useSheetColumnStyle(['auto']));
    expect(result.current).toEqual(FILL);
  });

  it('stays flex when dynamic sizing is on', () => {
    const { result } = renderHook(() => useSheetColumnStyle(['90%'], { enableDynamicSizing: true }));
    expect(result.current).toEqual(FILL);
  });

  it('stays flex with no snap points', () => {
    const undefinedPoints = renderHook(() => useSheetColumnStyle(undefined));
    const emptyPoints = renderHook(() => useSheetColumnStyle([]));
    expect(undefinedPoints.result.current).toEqual(FILL);
    expect(emptyPoints.result.current).toEqual(FILL);
  });

  it('stays flex on Android (the native Material sheet bounds the column itself)', () => {
    platformMock.OS = 'android';
    const { result } = renderHook(() => useSheetColumnStyle(['90%']));
    expect(result.current).toEqual(FILL);
  });
});
