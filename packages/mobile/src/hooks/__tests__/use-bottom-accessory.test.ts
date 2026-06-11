// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const cfg = vi.hoisted(() => ({
  platformOS: 'ios' as 'ios' | 'android',
  reactNativeMinor: 82 as number | undefined,
  liquidGlassAvailable: true,
  nativeTabs: {} as unknown,
  bottomAccessory: {} as unknown,
  variant: 'liquidGlass' as 'liquidGlass' | 'material',
}));

vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return cfg.platformOS;
    },
    get constants() {
      return { reactNativeVersion: { minor: cfg.reactNativeMinor } };
    },
  },
}));

vi.mock('expo-glass-effect', () => ({
  isLiquidGlassAvailable: () => cfg.liquidGlassAvailable,
}));

vi.mock('expo-router/unstable-native-tabs', () => ({
  get NativeTabs() {
    if (cfg.nativeTabs == null) {
      return cfg.nativeTabs;
    }

    return {
      BottomAccessory: cfg.bottomAccessory,
    };
  },
}));

vi.mock('../../providers/theme-provider', () => ({
  useTheme: () => ({ variant: cfg.variant }),
}));

import { isBottomAccessoryAvailable, useNativeAccessoryActive } from '../use-bottom-accessory';

describe('use-bottom-accessory', () => {
  beforeEach(() => {
    cfg.platformOS = 'ios';
    cfg.reactNativeMinor = 82;
    cfg.liquidGlassAvailable = true;
    cfg.nativeTabs = {};
    cfg.bottomAccessory = {};
    cfg.variant = 'liquidGlass';
  });

  it('uses the native BottomAccessory export as the capability check', () => {
    expect(isBottomAccessoryAvailable()).toBe(true);
  });

  it('does not require React Native minor 82 or newer', () => {
    cfg.reactNativeMinor = 81;

    expect(isBottomAccessoryAvailable()).toBe(true);
  });

  it('does not require the React Native minor version to be present', () => {
    cfg.reactNativeMinor = undefined;

    expect(isBottomAccessoryAvailable()).toBe(true);
  });

  it('returns false outside iOS', () => {
    cfg.platformOS = 'android';

    expect(isBottomAccessoryAvailable()).toBe(false);
  });

  it('returns false when Liquid Glass is unavailable', () => {
    cfg.liquidGlassAvailable = false;

    expect(isBottomAccessoryAvailable()).toBe(false);
  });

  it('returns false when the native accessory export is missing', () => {
    cfg.bottomAccessory = null;

    expect(isBottomAccessoryAvailable()).toBe(false);
  });

  it('returns false when the NativeTabs export is missing', () => {
    cfg.nativeTabs = null;

    expect(isBottomAccessoryAvailable()).toBe(false);
  });

  it('returns false when the NativeTabs export is undefined', () => {
    cfg.nativeTabs = undefined;

    expect(isBottomAccessoryAvailable()).toBe(false);
  });

  it('only reports the native accessory active for the Liquid Glass variant', () => {
    const { result, rerender } = renderHook(() => useNativeAccessoryActive());

    expect(result.current).toBe(true);

    cfg.variant = 'material';
    rerender();

    expect(result.current).toBe(false);
  });

  it('does not report the native accessory active when the capability is unavailable', () => {
    cfg.platformOS = 'android';

    const { result } = renderHook(() => useNativeAccessoryActive());

    expect(result.current).toBe(false);
  });
});
