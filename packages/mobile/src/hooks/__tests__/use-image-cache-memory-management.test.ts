// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const clearMemoryCache = vi.hoisted(() => vi.fn(() => Promise.resolve(true)));

// Capture each AppState handler by event name so tests can fire them and assert
// the registered subscriptions are torn down on unmount.
const appState = vi.hoisted(() => {
  const handlers: Record<string, (state?: string) => void> = {};
  const removers: Record<string, ReturnType<typeof vi.fn>> = {};
  return {
    handlers,
    removers,
    addEventListener: vi.fn((event: string, cb: (state?: string) => void) => {
      handlers[event] = cb;
      const remove = vi.fn();
      removers[event] = remove;
      return { remove };
    }),
    fire: (event: string, state?: string) => handlers[event]?.(state),
  };
});

vi.mock('react-native', () => ({
  AppState: { addEventListener: appState.addEventListener },
}));

vi.mock('expo-image', () => ({
  Image: { clearMemoryCache },
}));

// Control the background flag directly so the cache-flush effect can be asserted
// without driving the real AppState store.
const isBackgrounded = vi.hoisted(() => ({ value: false }));
vi.mock('../../lib/app-visibility', () => ({
  useIsAppBackgrounded: () => isBackgrounded.value,
}));

// Drive the focused route segments and the launch-fixed iPad flag directly so the
// tab-switch sweep can be asserted without a navigation container.
const segments = vi.hoisted(() => ({ value: ['(tabs)', 'home'] as readonly string[] }));
vi.mock('expo-router', () => ({ useSegments: () => segments.value }));
const deviceLayout = vi.hoisted(() => ({ isPad: true }));
vi.mock('../use-device-layout', () => ({ useDeviceLayout: () => ({ isPad: deviceLayout.isPad }) }));

import { useImageCacheMemoryManagement, useIpadTabSwitchImageCacheSweep } from '../use-image-cache-memory-management';

describe('useImageCacheMemoryManagement', () => {
  beforeEach(() => {
    clearMemoryCache.mockClear();
    appState.addEventListener.mockClear();
    isBackgrounded.value = false;
  });

  it('does not flush while foregrounded', () => {
    renderHook(() => useImageCacheMemoryManagement());
    expect(clearMemoryCache).not.toHaveBeenCalled();
  });

  it('flushes the image memory cache once the app is backgrounded', () => {
    isBackgrounded.value = true;
    renderHook(() => useImageCacheMemoryManagement());
    expect(clearMemoryCache).toHaveBeenCalledTimes(1);
  });

  it('flushes when transitioning foreground -> background', () => {
    const { rerender } = renderHook(() => useImageCacheMemoryManagement());
    expect(clearMemoryCache).not.toHaveBeenCalled();
    isBackgrounded.value = true;
    rerender();
    expect(clearMemoryCache).toHaveBeenCalledTimes(1);
  });

  it('does not re-flush when returning to the foreground', () => {
    isBackgrounded.value = true;
    const { rerender } = renderHook(() => useImageCacheMemoryManagement());
    expect(clearMemoryCache).toHaveBeenCalledTimes(1);
    isBackgrounded.value = false;
    rerender();
    // Foregrounding must NOT sweep again — the effect gates on the flag value.
    expect(clearMemoryCache).toHaveBeenCalledTimes(1);
  });

  it('flushes again on each background across repeated background/foreground cycles', () => {
    isBackgrounded.value = true;
    const { rerender } = renderHook(() => useImageCacheMemoryManagement());
    expect(clearMemoryCache).toHaveBeenCalledTimes(1);
    isBackgrounded.value = false;
    rerender();
    isBackgrounded.value = true;
    rerender();
    // A second background sweeps again — the flag genuinely flipped.
    expect(clearMemoryCache).toHaveBeenCalledTimes(2);
  });

  it('registers and tears down the memoryWarning listener', () => {
    const { unmount } = renderHook(() => useImageCacheMemoryManagement());
    expect(appState.addEventListener).toHaveBeenCalledWith('memoryWarning', expect.any(Function));
    appState.fire('memoryWarning');
    expect(clearMemoryCache).toHaveBeenCalledTimes(1);
    unmount();
    expect(appState.removers.memoryWarning).toHaveBeenCalledTimes(1);
  });
});

describe('useIpadTabSwitchImageCacheSweep', () => {
  beforeEach(() => {
    clearMemoryCache.mockClear();
    deviceLayout.isPad = true;
    segments.value = ['(tabs)', 'home'];
  });

  it('does not sweep on mount — it seeds the current tab', () => {
    renderHook(() => useIpadTabSwitchImageCacheSweep());
    expect(clearMemoryCache).not.toHaveBeenCalled();
  });

  it('sweeps the memory cache on an iPad top-level tab change', () => {
    const { rerender } = renderHook(() => useIpadTabSwitchImageCacheSweep());
    expect(clearMemoryCache).not.toHaveBeenCalled();
    segments.value = ['(tabs)', 'climbs'];
    rerender();
    expect(clearMemoryCache).toHaveBeenCalledTimes(1);
  });

  it('does not sweep for a sub-route within the same tab', () => {
    segments.value = ['(tabs)', 'climbs'];
    const { rerender } = renderHook(() => useIpadTabSwitchImageCacheSweep());
    // Pushing climbs/[climbUuid] keeps the active tab 'climbs' (segment 1), so
    // navigating within a tab must not sweep.
    segments.value = ['(tabs)', 'climbs', 'abc-uuid'];
    rerender();
    expect(clearMemoryCache).not.toHaveBeenCalled();
  });

  it('does not sweep on a non-iPad device', () => {
    deviceLayout.isPad = false;
    const { rerender } = renderHook(() => useIpadTabSwitchImageCacheSweep());
    segments.value = ['(tabs)', 'climbs'];
    rerender();
    expect(clearMemoryCache).not.toHaveBeenCalled();
  });

  it('dedupes repeated identical tab emissions', () => {
    const { rerender } = renderHook(() => useIpadTabSwitchImageCacheSweep());
    segments.value = ['(tabs)', 'home'];
    rerender();
    expect(clearMemoryCache).not.toHaveBeenCalled();
  });

  it('sweeps again on each distinct tab change', () => {
    const { rerender } = renderHook(() => useIpadTabSwitchImageCacheSweep());
    segments.value = ['(tabs)', 'climbs'];
    rerender();
    segments.value = ['(tabs)', 'profile'];
    rerender();
    expect(clearMemoryCache).toHaveBeenCalledTimes(2);
  });

  it('seeds a null active tab on a root-modal cold start, then sweeps on the first tab nav', () => {
    // Cold-start straight into a root modal / player (segment 0 is not `(tabs)`),
    // so tabsActiveSegment is null. The seed must record that null without sweeping,
    // and the first real tab navigation must then sweep once.
    segments.value = ['play'];
    const { rerender } = renderHook(() => useIpadTabSwitchImageCacheSweep());
    expect(clearMemoryCache).not.toHaveBeenCalled();
    segments.value = ['(tabs)', 'home'];
    rerender();
    expect(clearMemoryCache).toHaveBeenCalledTimes(1);
  });
});
