import { beforeEach, describe, expect, it, vi } from 'vitest';

const cfg = vi.hoisted(() => ({
  platformOS: 'ios' as 'ios' | 'android',
  liquidGlassAvailable: true,
  bottomAccessory: {} as unknown,
  variant: 'liquidGlass' as 'liquidGlass' | 'material',
}));

vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return cfg.platformOS;
    },
  },
}));

vi.mock('expo-glass-effect', () => ({
  isLiquidGlassAvailable: () => cfg.liquidGlassAvailable,
}));

vi.mock('expo-router/unstable-native-tabs', () => ({
  NativeTabs: {
    get BottomAccessory() {
      return cfg.bottomAccessory;
    },
  },
}));

vi.mock('../../providers/theme-provider', () => ({
  useTheme: () => ({ variant: cfg.variant }),
}));

import { isBottomAccessoryAvailable, useNativeAccessoryActive } from '../use-bottom-accessory';

describe('use-bottom-accessory', () => {
  beforeEach(() => {
    cfg.platformOS = 'ios';
    cfg.liquidGlassAvailable = true;
    cfg.bottomAccessory = {};
    cfg.variant = 'liquidGlass';
  });

  it('uses the native BottomAccessory export as the capability check', () => {
    expect(isBottomAccessoryAvailable()).toBe(true);
  });

  it('does not require the React Native minor version to be present', () => {
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

  it('only reports the native accessory active for the Liquid Glass variant', () => {
    expect(useNativeAccessoryActive()).toBe(true);

    cfg.variant = 'material';

    expect(useNativeAccessoryActive()).toBe(false);
  });
});
