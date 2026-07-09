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

describe('boardsesh-grades-preference', () => {
  beforeEach(async () => {
    vi.resetModules();
    const asyncStorage = (await import('@react-native-async-storage/async-storage')).default as unknown as {
      __reset: () => void;
    };
    asyncStorage.__reset();
  });

  it('defaults OFF when nothing is stored', async () => {
    const { loadBoardseshGradesPreference } = await import('../boardsesh-grades-preference');
    await expect(loadBoardseshGradesPreference()).resolves.toBe(false);
  });

  it('honours an explicit ON choice persisted from a previous session', async () => {
    const asyncStorage = (await import('@react-native-async-storage/async-storage')).default as unknown as {
      __setRaw: (key: string, value: string) => void;
    };
    asyncStorage.__setRaw('useBoardseshGrades', JSON.stringify(true));

    const { loadBoardseshGradesPreference } = await import('../boardsesh-grades-preference');
    await expect(loadBoardseshGradesPreference()).resolves.toBe(true);
  });

  it('honours an explicit OFF choice persisted from a previous session', async () => {
    const asyncStorage = (await import('@react-native-async-storage/async-storage')).default as unknown as {
      __setRaw: (key: string, value: string) => void;
    };
    asyncStorage.__setRaw('useBoardseshGrades', JSON.stringify(false));

    const { loadBoardseshGradesPreference } = await import('../boardsesh-grades-preference');
    await expect(loadBoardseshGradesPreference()).resolves.toBe(false);
  });

  it('persists the user opt-in', async () => {
    const { loadBoardseshGradesPreference, setBoardseshGradesPreference } =
      await import('../boardsesh-grades-preference');
    await setBoardseshGradesPreference(true);
    await expect(loadBoardseshGradesPreference()).resolves.toBe(true);
  });

  it('lets a set() that races in during the initial load win over the (now stale) persisted value', async () => {
    const asyncStorage = (await import('@react-native-async-storage/async-storage')).default as unknown as {
      __setRaw: (key: string, value: string) => void;
      getItem: ReturnType<typeof vi.fn>;
    };
    // Persisted value is OFF, but gate the read so it resolves only after the
    // user's explicit choice has already landed.
    asyncStorage.__setRaw('useBoardseshGrades', JSON.stringify(false));
    let releaseRead: () => void = () => {};
    const readGate = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });
    asyncStorage.getItem.mockImplementationOnce(async () => {
      await readGate;
      return JSON.stringify(false);
    });

    const { loadBoardseshGradesPreference, setBoardseshGradesPreference } =
      await import('../boardsesh-grades-preference');

    const loadPromise = loadBoardseshGradesPreference();
    // The user's explicit ON choice lands while the (slow) disk read is
    // still in flight.
    await setBoardseshGradesPreference(true);
    releaseRead();

    await expect(loadPromise).resolves.toBe(true);
  });
});
