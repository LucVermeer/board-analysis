import { describe, it, expect, vi, beforeEach } from 'vitest';

// A sentinel for the AFTER_FIRST_UNLOCK constant so the test can assert the
// exact keychainAccessible value the writers pass without depending on the
// native module's real numeric constant.
const AFTER_FIRST_UNLOCK = Symbol('AFTER_FIRST_UNLOCK');

vi.mock('expo-secure-store', () => {
  let storage: Record<string, string> = {};
  const setItemAsync = vi.fn(async (key: string, value: string) => {
    storage[key] = value;
  });
  return {
    AFTER_FIRST_UNLOCK,
    getItemAsync: vi.fn(async (key: string) => storage[key] ?? null),
    setItemAsync,
    deleteItemAsync: vi.fn(async (key: string) => {
      delete storage[key];
    }),
    __reset: () => {
      storage = {};
      setItemAsync.mockClear();
    },
  };
});

async function secureStore() {
  return (await import('expo-secure-store')) as unknown as {
    __reset: () => void;
    setItemAsync: ReturnType<typeof vi.fn>;
  };
}

const JWT_KEY = 'boardsesh_jwt';
const REFRESH_TOKEN_KEY = 'boardsesh_refresh_token';
const EXPIRES_AT_KEY = 'boardsesh_token_expires_at';

beforeEach(async () => {
  (await secureStore()).__reset();
});

describe('auth-store', () => {
  it('writes every token with keychainAccessible: AFTER_FIRST_UNLOCK', async () => {
    const store = await secureStore();
    const { storeTokens } = await import('../auth-store');

    await storeTokens('jwt-value', 'refresh-value', '2026-08-01T00:00:00.000Z');

    // Every write is what keeps a locked-device background read from rejecting
    // with "User interaction is not allowed" (issue #3602). Reads inherit the
    // accessibility the item was written with, so each key must carry it.
    const options = { keychainAccessible: AFTER_FIRST_UNLOCK };
    expect(store.setItemAsync).toHaveBeenCalledWith(JWT_KEY, 'jwt-value', options);
    expect(store.setItemAsync).toHaveBeenCalledWith(REFRESH_TOKEN_KEY, 'refresh-value', options);
    expect(store.setItemAsync).toHaveBeenCalledWith(EXPIRES_AT_KEY, '2026-08-01T00:00:00.000Z', options);
    expect(store.setItemAsync).toHaveBeenCalledTimes(3);
  });

  it('round-trips stored tokens through the getters', async () => {
    const { storeTokens, getAuthToken, getRefreshToken, getTokenExpiresAt } = await import('../auth-store');

    await storeTokens('jwt-value', 'refresh-value', '2026-08-01T00:00:00.000Z');

    expect(await getAuthToken()).toBe('jwt-value');
    expect(await getRefreshToken()).toBe('refresh-value');
    expect((await getTokenExpiresAt())?.toISOString()).toBe('2026-08-01T00:00:00.000Z');
  });
});
