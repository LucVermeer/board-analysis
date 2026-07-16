import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';
import { renderHook, act, waitFor } from '@testing-library/react';

const { getPreferenceMock, setPreferenceMock } = vi.hoisted(() => ({
  getPreferenceMock: vi.fn(),
  setPreferenceMock: vi.fn(),
}));

vi.mock('@/app/lib/user-preferences-db', () => ({
  getPreference: getPreferenceMock,
  setPreference: setPreferenceMock,
}));

import ColorModeProvider from '../color-mode-provider';
import { useColorMode } from '../../../hooks/use-color-mode';
import { COLOR_MODE_MIRROR_KEY } from '../../../theme/theme-init-script';

const storage = new Map<string, string>();
const localStorageStub = {
  getItem: (key: string): string | null => storage.get(key) ?? null,
  setItem: vi.fn((key: string, value: string) => {
    storage.set(key, value);
  }),
  removeItem: (key: string) => {
    storage.delete(key);
  },
  clear: () => {
    storage.clear();
  },
};

Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: localStorageStub });

beforeEach(() => {
  vi.clearAllMocks();
  storage.clear();
  document.documentElement.removeAttribute('data-theme');
  getPreferenceMock.mockResolvedValue(null);
});

describe('ColorModeProvider', () => {
  it('syncs mode from the pre-paint data-theme attribute on mount', async () => {
    document.documentElement.setAttribute('data-theme', 'light');

    const { result } = renderHook(() => useColorMode(), { wrapper: ColorModeProvider });

    await waitFor(() => expect(result.current.mode).toBe('light'));
    // No saved IndexedDB preference → nothing to seed, so the mirror isn't written.
    expect(localStorageStub.setItem).not.toHaveBeenCalled();
  });

  it('toggle writes the preference to IndexedDB and the localStorage mirror', async () => {
    document.documentElement.setAttribute('data-theme', 'dark');

    const { result } = renderHook(() => useColorMode(), { wrapper: ColorModeProvider });
    await waitFor(() => expect(result.current.mode).toBe('dark'));

    act(() => result.current.toggleMode());

    expect(result.current.mode).toBe('light');
    expect(setPreferenceMock).toHaveBeenCalledWith('colorMode', 'light');
    expect(localStorageStub.setItem).toHaveBeenCalledWith(COLOR_MODE_MIRROR_KEY, 'light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('applies the IndexedDB value over the attribute and refreshes the mirror', async () => {
    document.documentElement.setAttribute('data-theme', 'light');
    getPreferenceMock.mockResolvedValue('dark');

    const { result } = renderHook(() => useColorMode(), { wrapper: ColorModeProvider });

    await waitFor(() => expect(result.current.mode).toBe('dark'));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorageStub.setItem).toHaveBeenCalledWith(COLOR_MODE_MIRROR_KEY, 'dark');
  });
});
