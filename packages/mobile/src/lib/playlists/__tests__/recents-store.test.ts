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

const STORAGE_KEY = 'boardsesh:recent-playlists';

async function resetStorage() {
  vi.resetModules();
  const asyncStorage = (await import('@react-native-async-storage/async-storage')).default as unknown as {
    __reset: () => void;
    __setRaw: (key: string, value: string) => void;
  };
  asyncStorage.__reset();
  return asyncStorage;
}

describe('recents-store', () => {
  beforeEach(async () => {
    await resetStorage();
  });

  it('returns an empty list when nothing has been recorded', async () => {
    const { getRecentPlaylists } = await import('../recents-store');
    await expect(getRecentPlaylists()).resolves.toEqual([]);
  });

  it('records an open with a numeric timestamp', async () => {
    const { recordPlaylistOpen, getRecentPlaylists } = await import('../recents-store');
    await recordPlaylistOpen({ uuid: 'a', boardType: 'kilter', layoutId: 1 });
    const recents = await getRecentPlaylists();
    expect(recents).toHaveLength(1);
    expect(recents[0]).toMatchObject({ uuid: 'a', boardType: 'kilter', layoutId: 1 });
    expect(typeof recents[0]?.timestamp).toBe('number');
  });

  it('dedupes by uuid, bubbling a re-opened playlist to the front', async () => {
    const { recordPlaylistOpen, getRecentPlaylists } = await import('../recents-store');
    await recordPlaylistOpen({ uuid: 'a', boardType: 'kilter', layoutId: 1 });
    await recordPlaylistOpen({ uuid: 'b', boardType: 'kilter', layoutId: 1 });
    await recordPlaylistOpen({ uuid: 'a', boardType: 'kilter', layoutId: 1 });
    const recents = await getRecentPlaylists();
    expect(recents.map((r) => r.uuid)).toEqual(['a', 'b']);
  });

  it('caps at 16 entries, dropping the oldest, newest first', async () => {
    const { recordPlaylistOpen, getRecentPlaylists } = await import('../recents-store');
    for (let index = 0; index < 17; index += 1) {
      await recordPlaylistOpen({ uuid: `p${index}`, boardType: 'kilter', layoutId: 1 });
    }
    const recents = await getRecentPlaylists();
    expect(recents).toHaveLength(16);
    expect(recents[0]?.uuid).toBe('p16'); // newest first
    expect(recents.some((r) => r.uuid === 'p0')).toBe(false); // oldest dropped
  });

  it('returns an empty list when the stored payload is corrupt', async () => {
    const asyncStorage = await resetStorage();
    asyncStorage.__setRaw(STORAGE_KEY, '{not json');
    const { getRecentPlaylists } = await import('../recents-store');
    await expect(getRecentPlaylists()).resolves.toEqual([]);
  });

  it('notifies subscribers on record and stops after unsubscribe', async () => {
    const { recordPlaylistOpen, mobileRecentsAdapter } = await import('../recents-store');
    const onChange = vi.fn();
    const unsubscribe = mobileRecentsAdapter.subscribe!(onChange);

    await recordPlaylistOpen({ uuid: 'a', boardType: 'kilter', layoutId: 1 });
    expect(onChange).toHaveBeenCalledTimes(1);

    unsubscribe();
    await recordPlaylistOpen({ uuid: 'b', boardType: 'kilter', layoutId: 1 });
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
