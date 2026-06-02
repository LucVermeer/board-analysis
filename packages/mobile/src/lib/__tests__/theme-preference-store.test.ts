import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@react-native-async-storage/async-storage', () => {
  let storage: Record<string, string> = {};
  return {
    default: {
      getItem: vi.fn(async (key: string) => storage[key] ?? null),
      setItem: vi.fn(async (key: string, value: string) => {
        storage[key] = value;
      }),
      removeItem: vi.fn(async (key: string) => {
        delete storage[key];
      }),
      __reset: () => {
        storage = {};
      },
      __setRaw: (key: string, value: string) => {
        storage[key] = value;
      },
    },
  };
});

describe('theme-preference-store', () => {
  beforeEach(async () => {
    vi.resetModules();
    const asyncStorage = (await import('@react-native-async-storage/async-storage')).default as unknown as {
      __reset: () => void;
    };
    asyncStorage.__reset();
  });

  it('returns null when no preference is stored', async () => {
    const { getStoredColorSchemePreference } = await import('../theme-preference-store');
    await expect(getStoredColorSchemePreference()).resolves.toBeNull();
  });

  it('round-trips a stored preference', async () => {
    const { getStoredColorSchemePreference, setStoredColorSchemePreference } =
      await import('../theme-preference-store');
    await setStoredColorSchemePreference('dark');
    await expect(getStoredColorSchemePreference()).resolves.toBe('dark');
  });

  it('overwrites a previously stored preference', async () => {
    const { getStoredColorSchemePreference, setStoredColorSchemePreference } =
      await import('../theme-preference-store');
    await setStoredColorSchemePreference('dark');
    await setStoredColorSchemePreference('system');
    await expect(getStoredColorSchemePreference()).resolves.toBe('system');
  });

  it('returns null rather than throwing on a corrupt payload', async () => {
    const asyncStorage = (await import('@react-native-async-storage/async-storage')).default as unknown as {
      __setRaw: (key: string, value: string) => void;
    };
    asyncStorage.__setRaw('pref.colorScheme', '{not json');
    const { getStoredColorSchemePreference } = await import('../theme-preference-store');
    await expect(getStoredColorSchemePreference()).resolves.toBeNull();
  });
});
