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
    getItem: vi.fn((key: string) => storage[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      storage[key] = value;
    }),
    __reset: () => {
      storage = {};
    },
    __setRaw: (key: string, value: string) => {
      storage[key] = value;
    },
    __throwNext: () => {},
  };
});

vi.mock('expo-crypto', () => ({
  randomUUID: () => 'test-uuid',
}));

describe('partyProfileStorage', () => {
  beforeEach(async () => {
    vi.resetModules();
    const secureStore = (await import('expo-secure-store')) as unknown as { __reset: () => void };
    secureStore.__reset();
  });

  it('round-trips a profile via SecureStore', async () => {
    const { partyProfileStorage } = await import('../party-profile-store');

    await partyProfileStorage.set({ id: 'uuid-1' });
    await expect(partyProfileStorage.get()).resolves.toEqual({ id: 'uuid-1' });
  });

  it('returns null when nothing is stored', async () => {
    const { partyProfileStorage } = await import('../party-profile-store');
    await expect(partyProfileStorage.get()).resolves.toBeNull();
  });

  it('returns null on a parse error rather than throwing', async () => {
    const secureStore = (await import('expo-secure-store')) as unknown as {
      __setRaw: (key: string, value: string) => void;
    };
    secureStore.__setRaw('boardsesh_party_profile', '{not json');

    const { partyProfileStorage } = await import('../party-profile-store');
    await expect(partyProfileStorage.get()).resolves.toBeNull();
  });

  it('returns null when stored value is missing the id field', async () => {
    const secureStore = (await import('expo-secure-store')) as unknown as {
      __setRaw: (key: string, value: string) => void;
    };
    secureStore.__setRaw('boardsesh_party_profile', JSON.stringify({ name: 'no-id' }));

    const { partyProfileStorage } = await import('../party-profile-store');
    await expect(partyProfileStorage.get()).resolves.toBeNull();
  });

  it('returns null when SecureStore.getItemAsync throws', async () => {
    const secureStore = (await import('expo-secure-store')) as unknown as {
      getItemAsync: ReturnType<typeof vi.fn>;
    };
    secureStore.getItemAsync.mockImplementationOnce(async () => {
      throw new Error('keychain locked');
    });

    const { partyProfileStorage } = await import('../party-profile-store');
    await expect(partyProfileStorage.get()).resolves.toBeNull();
  });
});

describe('getOrCreatePartyProfileIdSync', () => {
  beforeEach(async () => {
    vi.resetModules();
    const secureStore = (await import('expo-secure-store')) as unknown as { __reset: () => void };
    secureStore.__reset();
  });

  it('returns the existing stored id without creating a new one', async () => {
    const secureStore = (await import('expo-secure-store')) as unknown as {
      __setRaw: (key: string, value: string) => void;
      setItem: ReturnType<typeof vi.fn>;
    };
    secureStore.__setRaw('boardsesh_party_profile', JSON.stringify({ id: 'stored-uuid' }));
    const { getOrCreatePartyProfileIdSync } = await import('../party-profile-store');

    expect(getOrCreatePartyProfileIdSync()).toBe('stored-uuid');
    expect(secureStore.setItem).not.toHaveBeenCalled();
  });

  it('creates and persists a new id via the injected generator when nothing is stored', async () => {
    const secureStore = (await import('expo-secure-store')) as unknown as { setItem: ReturnType<typeof vi.fn> };
    const { getOrCreatePartyProfileIdSync } = await import('../party-profile-store');

    const id = getOrCreatePartyProfileIdSync(() => 'generated-uuid');

    expect(id).toBe('generated-uuid');
    expect(secureStore.setItem).toHaveBeenCalledWith(
      'boardsesh_party_profile',
      JSON.stringify({ id: 'generated-uuid' }),
    );
  });

  it('uses expo-crypto randomUUID by default', async () => {
    const { getOrCreatePartyProfileIdSync } = await import('../party-profile-store');
    expect(getOrCreatePartyProfileIdSync()).toBe('test-uuid');
  });

  it('returns null on a parse error rather than throwing', async () => {
    const secureStore = (await import('expo-secure-store')) as unknown as {
      __setRaw: (key: string, value: string) => void;
    };
    secureStore.__setRaw('boardsesh_party_profile', '{not json');

    const { getOrCreatePartyProfileIdSync } = await import('../party-profile-store');
    expect(getOrCreatePartyProfileIdSync()).toBeNull();
  });

  it('returns null when SecureStore.getItem throws', async () => {
    const secureStore = (await import('expo-secure-store')) as unknown as { getItem: ReturnType<typeof vi.fn> };
    secureStore.getItem.mockImplementationOnce(() => {
      throw new Error('keychain locked');
    });

    const { getOrCreatePartyProfileIdSync } = await import('../party-profile-store');
    expect(getOrCreatePartyProfileIdSync()).toBeNull();
  });

  it('returns null when SecureStore.setItem throws', async () => {
    const secureStore = (await import('expo-secure-store')) as unknown as { setItem: ReturnType<typeof vi.fn> };
    secureStore.setItem.mockImplementationOnce(() => {
      throw new Error('keychain locked');
    });

    const { getOrCreatePartyProfileIdSync } = await import('../party-profile-store');
    expect(getOrCreatePartyProfileIdSync()).toBeNull();
  });
});
