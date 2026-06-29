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
      __getRaw: (key: string) => storage[key] ?? null,
    },
  };
});

const STORAGE_KEY = 'climbCardSectionExpanded';

async function getMockStorage() {
  return (await import('@react-native-async-storage/async-storage')).default as unknown as {
    __reset: () => void;
    __setRaw: (key: string, value: string) => void;
    __getRaw: (key: string) => string | null;
  };
}

describe('section-expand-store', () => {
  beforeEach(async () => {
    vi.resetModules();
    (await getMockStorage()).__reset();
  });

  it('reads undefined for an unset key before and after an empty load', async () => {
    const { getSectionExpandedSync, loadSectionExpandState } = await import('../section-expand-store');
    expect(getSectionExpandedSync('logbook')).toBeUndefined();
    await loadSectionExpandState();
    expect(getSectionExpandedSync('logbook')).toBeUndefined();
  });

  it('loads a stored expand map', async () => {
    (await getMockStorage()).__setRaw(STORAGE_KEY, JSON.stringify({ logbook: true, community: false }));
    const { loadSectionExpandState, getSectionExpandedSync } = await import('../section-expand-store');
    await loadSectionExpandState();
    expect(getSectionExpandedSync('logbook')).toBe(true);
    expect(getSectionExpandedSync('community')).toBe(false);
    expect(getSectionExpandedSync('similarClimbs')).toBeUndefined();
  });

  it('falls back to an empty map for a malformed stored payload', async () => {
    // Non-boolean values are rejected wholesale rather than partially trusted.
    (await getMockStorage()).__setRaw(STORAGE_KEY, JSON.stringify({ logbook: 'yes' }));
    const { loadSectionExpandState, getSectionExpandedSync } = await import('../section-expand-store');
    await loadSectionExpandState();
    expect(getSectionExpandedSync('logbook')).toBeUndefined();
  });

  it('updates the in-memory value synchronously and persists it', async () => {
    const { setSectionExpanded, getSectionExpandedSync } = await import('../section-expand-store');
    setSectionExpanded('logbook', true);
    expect(getSectionExpandedSync('logbook')).toBe(true);

    // The write is best-effort/async; flush microtasks then assert it reached storage.
    await Promise.resolve();
    const raw = (await getMockStorage()).__getRaw(STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string)).toEqual({ logbook: true });
  });

  it('a set before load wins over the persisted value (no clobber on race)', async () => {
    (await getMockStorage()).__setRaw(STORAGE_KEY, JSON.stringify({ logbook: false }));
    const { setSectionExpanded, loadSectionExpandState, getSectionExpandedSync } =
      await import('../section-expand-store');
    setSectionExpanded('logbook', true);
    await loadSectionExpandState();
    expect(getSectionExpandedSync('logbook')).toBe(true);
  });

  it('merges a new section without dropping existing ones', async () => {
    const { setSectionExpanded, getSectionExpandedSync } = await import('../section-expand-store');
    setSectionExpanded('logbook', true);
    setSectionExpanded('community', false);
    expect(getSectionExpandedSync('logbook')).toBe(true);
    expect(getSectionExpandedSync('community')).toBe(false);
  });
});
