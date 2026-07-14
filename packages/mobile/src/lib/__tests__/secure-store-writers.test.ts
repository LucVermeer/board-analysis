import { describe, it, expect, vi, beforeEach } from 'vitest';

// Guards the SecureStore-writer contract from issue #3602: every write must carry
// keychainAccessible: AFTER_FIRST_UNLOCK so a locked-device background read stays
// accessible. The shared SECURE_STORE_WRITE_OPTIONS constant is unit-tested via
// auth-store; this pins the wiring for the other writers so a future edit that
// drops the option from one call site is caught (the review's stated risk).
const AFTER_FIRST_UNLOCK = 'after-first-unlock';

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

const EXPECTED_OPTIONS = { keychainAccessible: AFTER_FIRST_UNLOCK };

beforeEach(async () => {
  (await secureStore()).__reset();
});

describe('SecureStore writers pass AFTER_FIRST_UNLOCK', () => {
  it('session-store setStoredSessionId', async () => {
    const store = await secureStore();
    const { setStoredSessionId } = await import('../session-store');

    await setStoredSessionId('session-123');

    expect(store.setItemAsync).toHaveBeenCalledWith('boardsesh_active_session_id', 'session-123', EXPECTED_OPTIONS);
  });

  it('last-grade-store setLastUsedGradeId', async () => {
    const store = await secureStore();
    const { setLastUsedGradeId } = await import('../last-grade-store');

    await setLastUsedGradeId(22);

    expect(store.setItemAsync).toHaveBeenCalledWith('boardsesh_last_used_grade', '22', EXPECTED_OPTIONS);
  });

  it('secure-store-adapter secureStorePreferences.set', async () => {
    const store = await secureStore();
    const { secureStorePreferences } = await import('../preferences/secure-store-adapter');

    await secureStorePreferences.set('some_pref', { enabled: true });

    expect(store.setItemAsync).toHaveBeenCalledWith('some_pref', JSON.stringify({ enabled: true }), EXPECTED_OPTIONS);
  });
});
