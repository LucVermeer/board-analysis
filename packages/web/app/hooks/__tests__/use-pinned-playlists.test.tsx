import { describe, it, expect, vi, beforeEach, afterEach } from 'vite-plus/test';
import { renderHook, waitFor, act } from '@testing-library/react';
import type { Playlist } from '@boardsesh/graphql/operations/playlists';
import type { RecentPlaylist } from '@/app/lib/recent-playlists-db';

// --- Mocks ---

const mockRequest = vi.fn();
const mockGetRecentPlaylists = vi.fn<() => Promise<RecentPlaylist[]>>();

vi.mock('@/app/lib/graphql/client', () => ({
  createGraphQLHttpClient: () => ({ request: mockRequest }),
}));

vi.mock('@boardsesh/graphql/operations/playlists', () => ({
  GET_MY_PINNED_PLAYLISTS: 'GET_MY_PINNED_PLAYLISTS_QUERY',
}));

vi.mock('@/app/lib/recent-playlists-db', () => ({
  getRecentPlaylists: () => mockGetRecentPlaylists(),
  RECENT_PLAYLISTS_CHANGED_EVENT: 'boardsesh:recent-playlists-changed',
}));

// Import after mocks so the module picks up the mocked deps.
import { usePinnedPlaylists } from '../use-pinned-playlists';

// --- Helpers ---

function makePlaylist(uuid: string, overrides: Partial<Playlist> = {}): Playlist {
  return {
    id: uuid.replace(/[^0-9]/g, '') || '1',
    uuid,
    boardType: 'kilter',
    layoutId: 1,
    name: `Playlist ${uuid}`,
    isPublic: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    climbCount: 0,
    followerCount: 0,
    isFollowedByMe: false,
    isPinnedByMe: false,
    ...overrides,
  };
}

function makeRecent(uuid: string, overrides: Partial<RecentPlaylist> = {}): RecentPlaylist {
  return {
    uuid,
    boardType: 'kilter',
    layoutId: 1,
    timestamp: Date.now(),
    ...overrides,
  };
}

// --- Tests ---

describe('usePinnedPlaylists', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRecentPlaylists.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not call GraphQL when token is null', async () => {
    const { result } = renderHook(() => usePinnedPlaylists({ token: null, candidatePlaylists: [] }));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockRequest).not.toHaveBeenCalled();
    expect(result.current.pinned).toEqual([]);
    expect(result.current.source).toBe('empty');
  });

  it('returns server pins with source="pinned" when the user has pins', async () => {
    const serverPin = makePlaylist('pl-server', { isPinnedByMe: true });
    mockRequest.mockResolvedValue({ myPinnedPlaylists: [serverPin] });

    const { result } = renderHook(() => usePinnedPlaylists({ token: 'tok', candidatePlaylists: [] }));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.source).toBe('pinned');
    expect(result.current.pinned).toEqual([serverPin]);
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  it('falls back to IndexedDB recents when the server returns no pins', async () => {
    mockRequest.mockResolvedValue({ myPinnedPlaylists: [] });
    mockGetRecentPlaylists.mockResolvedValue([makeRecent('pl-recent-1'), makeRecent('pl-recent-2')]);
    const candidates = [makePlaylist('pl-recent-1'), makePlaylist('pl-recent-2'), makePlaylist('pl-other')];

    const { result } = renderHook(() => usePinnedPlaylists({ token: 'tok', candidatePlaylists: candidates }));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.source).toBe('recent');
    // Recents preserve IndexedDB order (most-recent first), intersected with
    // the loaded candidatePlaylists pool.
    expect(result.current.pinned.map((p) => p.uuid)).toEqual(['pl-recent-1', 'pl-recent-2']);
  });

  it('returns source="empty" when both server pins and recents are empty', async () => {
    mockRequest.mockResolvedValue({ myPinnedPlaylists: [] });
    mockGetRecentPlaylists.mockResolvedValue([]);

    const { result } = renderHook(() =>
      usePinnedPlaylists({ token: 'tok', candidatePlaylists: [makePlaylist('pl-1')] }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.source).toBe('empty');
    expect(result.current.pinned).toEqual([]);
  });

  it('drops recents that are not in the candidate pool (no full data to render)', async () => {
    mockRequest.mockResolvedValue({ myPinnedPlaylists: [] });
    mockGetRecentPlaylists.mockResolvedValue([
      makeRecent('pl-known'),
      makeRecent('pl-unknown'), // not in candidate pool
    ]);

    const { result } = renderHook(() =>
      usePinnedPlaylists({ token: 'tok', candidatePlaylists: [makePlaylist('pl-known')] }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.source).toBe('recent');
    expect(result.current.pinned.map((p) => p.uuid)).toEqual(['pl-known']);
  });

  it('filters recents by boardType', async () => {
    mockRequest.mockResolvedValue({ myPinnedPlaylists: [] });
    mockGetRecentPlaylists.mockResolvedValue([
      makeRecent('pl-kilter', { boardType: 'kilter' }),
      makeRecent('pl-tension', { boardType: 'tension' }),
    ]);
    const candidates = [
      makePlaylist('pl-kilter', { boardType: 'kilter' }),
      makePlaylist('pl-tension', { boardType: 'tension' }),
    ];

    const { result } = renderHook(() =>
      usePinnedPlaylists({ token: 'tok', boardType: 'kilter', candidatePlaylists: candidates }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.pinned.map((p) => p.uuid)).toEqual(['pl-kilter']);
  });

  it('filters recents by layoutId, but keeps Aurora-synced (null layout) entries', async () => {
    mockRequest.mockResolvedValue({ myPinnedPlaylists: [] });
    mockGetRecentPlaylists.mockResolvedValue([
      makeRecent('pl-layout-1', { layoutId: 1 }),
      makeRecent('pl-layout-8', { layoutId: 8 }),
      makeRecent('pl-aurora', { layoutId: null }),
    ]);
    const candidates = [
      makePlaylist('pl-layout-1', { layoutId: 1 }),
      makePlaylist('pl-layout-8', { layoutId: 8 }),
      makePlaylist('pl-aurora', { layoutId: null }),
    ];

    const { result } = renderHook(() =>
      usePinnedPlaylists({ token: 'tok', layoutId: 1, candidatePlaylists: candidates }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // pl-layout-8 is excluded; pl-aurora has null layoutId and passes the filter
    // (Aurora circuits don't have a layout, so they always match).
    expect(result.current.pinned.map((p) => p.uuid).sort()).toEqual(['pl-aurora', 'pl-layout-1']);
  });

  it('refreshes recents when RECENT_PLAYLISTS_CHANGED_EVENT fires', async () => {
    mockRequest.mockResolvedValue({ myPinnedPlaylists: [] });
    mockGetRecentPlaylists.mockResolvedValueOnce([]); // initial empty
    const candidates = [makePlaylist('pl-1')];

    const { result } = renderHook(() => usePinnedPlaylists({ token: 'tok', candidatePlaylists: candidates }));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.source).toBe('empty');

    // After the event fires, getRecentPlaylists should be re-called.
    mockGetRecentPlaylists.mockResolvedValueOnce([makeRecent('pl-1')]);

    await act(async () => {
      window.dispatchEvent(new CustomEvent('boardsesh:recent-playlists-changed'));
    });

    await waitFor(() => expect(result.current.source).toBe('recent'));
    expect(result.current.pinned.map((p) => p.uuid)).toEqual(['pl-1']);
  });

  it('returns server pins regardless of recents state when both are populated', async () => {
    mockRequest.mockResolvedValue({
      myPinnedPlaylists: [makePlaylist('pl-server', { isPinnedByMe: true })],
    });
    mockGetRecentPlaylists.mockResolvedValue([makeRecent('pl-recent')]);
    const candidates = [makePlaylist('pl-server'), makePlaylist('pl-recent')];

    const { result } = renderHook(() => usePinnedPlaylists({ token: 'tok', candidatePlaylists: candidates }));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Server pins always win; recents are not appended.
    expect(result.current.source).toBe('pinned');
    expect(result.current.pinned.map((p) => p.uuid)).toEqual(['pl-server']);
  });
});
