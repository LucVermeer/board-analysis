import { describe, it, expect, beforeEach, vi } from 'vitest';

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

import { isOfflineBoardEnabled, setOfflineBoardEnabled } from '../use-offline-board';
import { getSetting, resetAllSettings } from '../hooks';

// Pure key encode/parse coverage lives with the helpers in
// @boardsesh/offline-sync (src/__tests__/offline-board-key.test.ts); this file
// covers the MMKV-backed toggle store built on top of them.
describe('setOfflineBoardEnabled / isOfflineBoardEnabled', () => {
  const scope = { boardType: 'kilter', layoutId: 1, sizeId: 5 };

  beforeEach(() => {
    mockStorage.clear();
    resetAllSettings();
  });

  it('adds and removes the scope key from syncEnabledBoards', () => {
    expect(isOfflineBoardEnabled(scope)).toBe(false);

    setOfflineBoardEnabled(scope, true);
    expect(getSetting('syncEnabledBoards')).toEqual(['kilter:1:5']);
    expect(isOfflineBoardEnabled(scope)).toBe(true);

    setOfflineBoardEnabled(scope, false);
    expect(getSetting('syncEnabledBoards')).toEqual([]);
    expect(isOfflineBoardEnabled(scope)).toBe(false);
  });

  it('is idempotent — enabling twice keeps one entry', () => {
    setOfflineBoardEnabled(scope, true);
    setOfflineBoardEnabled(scope, true);
    expect(getSetting('syncEnabledBoards')).toEqual(['kilter:1:5']);
  });

  it('leaves other enabled boards untouched when toggling one', () => {
    setOfflineBoardEnabled({ boardType: 'tension', layoutId: 8, sizeId: 10 }, true);
    setOfflineBoardEnabled(scope, true);
    expect(getSetting('syncEnabledBoards')).toEqual(['tension:8:10', 'kilter:1:5']);

    setOfflineBoardEnabled(scope, false);
    expect(getSetting('syncEnabledBoards')).toEqual(['tension:8:10']);
  });
});
