import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('expo-secure-store', () => {
  let storage: Record<string, string> = {};
  return {
    getItemAsync: vi.fn(async (key: string) => storage[key] ?? null),
    setItemAsync: vi.fn(async (key: string, value: string) => {
      storage[key] = value;
    }),
    deleteItemAsync: vi.fn(async (key: string) => {
      delete storage[key];
    }),
    __reset: () => {
      storage = {};
    },
  };
});

describe('metro-target-store', () => {
  beforeEach(async () => {
    vi.resetModules();
    const store = await import('expo-secure-store');
    (store as unknown as { __reset: () => void }).__reset();
  });

  it('normalizes and deduplicates saved targets', async () => {
    const { addSavedMetroTarget, getSavedMetroTargets } = await import('../metro-target-store');

    await addSavedMetroTarget('HOST-A.example');
    await addSavedMetroTarget('http://host-a.example:8084/foo');
    await addSavedMetroTarget('host-a.example');

    await expect(getSavedMetroTargets()).resolves.toEqual(['host-a.example', 'http://host-a.example:8084']);
  });

  it('removes saved targets', async () => {
    const { addSavedMetroTarget, getSavedMetroTargets, removeSavedMetroTarget } = await import('../metro-target-store');

    await addSavedMetroTarget('host-a.example');
    await addSavedMetroTarget('host-b.example');
    await removeSavedMetroTarget('host-a.example');

    await expect(getSavedMetroTargets()).resolves.toEqual(['host-b.example']);
  });

  it('throws for invalid targets', async () => {
    const { addSavedMetroTarget } = await import('../metro-target-store');

    await expect(addSavedMetroTarget('https://host-a.example:8081')).rejects.toThrow('Enter a host');
  });
});
