// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Regression coverage for the useSyncExternalStore snapshot contract: the
// getSnapshot for an array-typed setting (syncEnabledBoards is the only one)
// must return a REFERENCE-STABLE value between writes. The original
// implementation re-parsed JSON per call, so React saw a "changed" store on
// every commit and looped straight into "Maximum update depth exceeded" —
// crashing any mount of Manage Boards once the setting had ever been written
// (every sign-out writes it).

const mockStorage = new Map<string, string>();

vi.mock('react-native-mmkv', () => {
  const createMockInstance = () => ({
    getString(key: string) {
      return mockStorage.get(key);
    },
    set(key: string, value: string) {
      mockStorage.set(key, value);
    },
    remove(key: string) {
      mockStorage.delete(key);
    },
    clearAll() {
      mockStorage.clear();
    },
  });
  return { createMMKV: vi.fn(() => createMockInstance()) };
});

import { useSetting, setSetting, resetAllSettings } from '../hooks';
import { useOfflineBoardEnabled } from '../use-offline-board';

beforeEach(() => {
  mockStorage.clear();
  resetAllSettings();
});

describe('useSetting rendering', () => {
  it('renders an array setting with a stored value without looping (stable snapshot)', () => {
    setSetting('syncEnabledBoards', ['kilter:8:17']);

    // Pre-fix this throws "Maximum update depth exceeded" from the
    // useSyncExternalStore re-render loop.
    const { result, rerender } = renderHook(() => useSetting('syncEnabledBoards'));
    expect(result.current[0]).toEqual(['kilter:8:17']);

    // The snapshot must be the SAME reference across unrelated re-renders.
    const firstReference = result.current[0];
    rerender();
    expect(result.current[0]).toBe(firstReference);
  });

  it('re-renders with the new value when the setting is written', () => {
    const { result } = renderHook(() => useSetting('syncEnabledBoards'));
    expect(result.current[0]).toEqual([]);

    act(() => {
      setSetting('syncEnabledBoards', ['tension:10:12']);
    });
    expect(result.current[0]).toEqual(['tension:10:12']);
  });

  it('useOfflineBoardEnabled tracks toggles without looping', () => {
    setSetting('syncEnabledBoards', []);
    const scope = { boardType: 'kilter', layoutId: 8, sizeId: 17 };

    const { result } = renderHook(() => useOfflineBoardEnabled(scope));
    expect(result.current[0]).toBe(false);

    act(() => {
      result.current[1](true);
    });
    expect(result.current[0]).toBe(true);

    act(() => {
      result.current[1](false);
    });
    expect(result.current[0]).toBe(false);
  });
});
