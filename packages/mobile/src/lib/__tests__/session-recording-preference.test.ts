import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

const FLAG = 'EXPO_PUBLIC_SESSION_RECORDING_DEFAULT_ON';

describe('session-recording-preference', () => {
  const originalFlag = process.env[FLAG];

  beforeEach(async () => {
    vi.resetModules();
    const asyncStorage = (await import('@react-native-async-storage/async-storage')).default as unknown as {
      __reset: () => void;
    };
    asyncStorage.__reset();
  });

  afterEach(() => {
    if (originalFlag === undefined) delete process.env[FLAG];
    else process.env[FLAG] = originalFlag;
  });

  it('defaults ON when the build flag is set and nothing is stored', async () => {
    process.env[FLAG] = 'true';
    const { loadSessionRecordingEnabled } = await import('../session-recording-preference');
    await expect(loadSessionRecordingEnabled()).resolves.toBe(true);
  });

  it('defaults OFF when the build flag is unset and nothing is stored', async () => {
    delete process.env[FLAG];
    const { loadSessionRecordingEnabled } = await import('../session-recording-preference');
    await expect(loadSessionRecordingEnabled()).resolves.toBe(false);
  });

  it('honours an explicit OFF choice even when the build flag is on', async () => {
    process.env[FLAG] = 'true';
    const asyncStorage = (await import('@react-native-async-storage/async-storage')).default as unknown as {
      __setRaw: (key: string, value: string) => void;
    };
    asyncStorage.__setRaw('sessionRecordingEnabled', JSON.stringify(false));

    const { loadSessionRecordingEnabled } = await import('../session-recording-preference');
    await expect(loadSessionRecordingEnabled()).resolves.toBe(false);
  });

  it('honours an explicit ON choice when the build flag is off', async () => {
    delete process.env[FLAG];
    const asyncStorage = (await import('@react-native-async-storage/async-storage')).default as unknown as {
      __setRaw: (key: string, value: string) => void;
    };
    asyncStorage.__setRaw('sessionRecordingEnabled', JSON.stringify(true));

    const { loadSessionRecordingEnabled } = await import('../session-recording-preference');
    await expect(loadSessionRecordingEnabled()).resolves.toBe(true);
  });

  it('persists the user choice over the build default', async () => {
    process.env[FLAG] = 'true';
    const { loadSessionRecordingEnabled, setSessionRecordingEnabledPreference } =
      await import('../session-recording-preference');
    await setSessionRecordingEnabledPreference(false);
    await expect(loadSessionRecordingEnabled()).resolves.toBe(false);
  });
});
