// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { ColorSchemePreference } from '../../lib/theme-preference-store';

// Capture the native calls the provider is expected to drive.
const setColorScheme = vi.fn();
const isReduceTransparencyEnabled = vi.fn(async (): Promise<boolean> => false);
const removeSubscription = vi.fn();
const addEventListener = vi.fn((..._args: unknown[]) => ({ remove: removeSubscription }));

vi.mock('react-native', () => ({
  Appearance: {
    setColorScheme: (...args: unknown[]) => setColorScheme(...args),
  },
  AccessibilityInfo: {
    isReduceTransparencyEnabled: () => isReduceTransparencyEnabled(),
    addEventListener: (...args: unknown[]) => addEventListener(...args),
  },
}));

const getStored = vi.fn(async (): Promise<ColorSchemePreference | null> => null);
const setStored = vi.fn(async (_pref: ColorSchemePreference): Promise<void> => {});

vi.mock('../../lib/theme-preference-store', () => ({
  getStoredColorSchemePreference: () => getStored(),
  setStoredColorSchemePreference: (pref: ColorSchemePreference) => setStored(pref),
}));

import { ColorSchemePreferenceProvider, useColorSchemePreference } from '../color-scheme-preference-provider';

const wrapper = ({ children }: { children: ReactNode }) => (
  <ColorSchemePreferenceProvider>{children}</ColorSchemePreferenceProvider>
);

describe('ColorSchemePreferenceProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getStored.mockResolvedValue(null);
    isReduceTransparencyEnabled.mockResolvedValue(false);
    addEventListener.mockReturnValue({ remove: removeSubscription });
  });

  it('defaults to system and applies "unspecified" when nothing is stored', async () => {
    const { result } = renderHook(() => useColorSchemePreference(), { wrapper });
    await waitFor(() => expect(result.current).toBeTruthy());
    expect(result.current.preference).toBe('system');
    expect(setColorScheme).toHaveBeenCalledWith('unspecified');
    expect(result.current.reduceTransparency).toBe(false);
  });

  it('loads a stored choice and pins the native appearance before exposing it', async () => {
    getStored.mockResolvedValue('dark');
    const { result } = renderHook(() => useColorSchemePreference(), { wrapper });
    await waitFor(() => expect(result.current?.preference).toBe('dark'));
    expect(setColorScheme).toHaveBeenCalledWith('dark');
  });

  it('exposes the OS reduce-transparency value', async () => {
    isReduceTransparencyEnabled.mockResolvedValue(true);
    const { result } = renderHook(() => useColorSchemePreference(), { wrapper });
    await waitFor(() => expect(result.current).toBeTruthy());
    expect(result.current.reduceTransparency).toBe(true);
  });

  it('setPreference persists the choice and drives Appearance', async () => {
    const { result } = renderHook(() => useColorSchemePreference(), { wrapper });
    await waitFor(() => expect(result.current).toBeTruthy());
    setColorScheme.mockClear();

    act(() => result.current.setPreference('light'));

    expect(result.current.preference).toBe('light');
    expect(setColorScheme).toHaveBeenCalledWith('light');
    expect(setStored).toHaveBeenCalledWith('light');
  });

  it('unsubscribes from reduce-transparency changes on unmount', async () => {
    const { result, unmount } = renderHook(() => useColorSchemePreference(), { wrapper });
    await waitFor(() => expect(result.current).toBeTruthy());
    unmount();
    expect(removeSubscription).toHaveBeenCalled();
  });
});
