// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// The metadata query goes through getHttpClient().request — mock it so we can
// make GET_PLAYLIST reject (the error path) or resolve (the not-found path).
const requestMock = vi.hoisted(() => vi.fn());
vi.mock('../../../../src/lib/graphql/client', () => ({
  getHttpClient: () => ({ request: requestMock }),
}));

// usePlaylistClimbs: the climbs infinite query. The detail screen only reads
// query.refetch (for the retry) and allClimbs here.
const climbsRefetch = vi.hoisted(() => vi.fn());
vi.mock('@boardsesh/playlists-react', () => ({
  usePlaylistClimbs: () => ({
    query: {
      isLoading: false,
      isFetchingNextPage: false,
      hasNextPage: false,
      fetchNextPage: vi.fn(),
      refetch: climbsRefetch,
    },
    allClimbs: [],
  }),
  usePlaylistMutations: () => ({
    updatePlaylist: vi.fn(),
    deletePlaylist: vi.fn(),
    pinPlaylist: vi.fn(),
    unpinPlaylist: vi.fn(),
    followPlaylist: vi.fn(),
    unfollowPlaylist: vi.fn(),
  }),
  usePlaylistItemMutations: () => ({
    reorderPlaylistClimb: vi.fn(),
    removeClimbFromPlaylist: vi.fn(),
  }),
}));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ playlist_uuid: 'p-1' }),
  useNavigation: () => ({ goBack: vi.fn() }),
}));

vi.mock('react-native', () => ({
  View: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
  Pressable: ({
    children,
    onPress,
    accessibilityLabel,
  }: {
    children?: ReactNode;
    onPress?: () => void;
    accessibilityLabel?: string;
  }) => createElement('button', { onClick: onPress, 'aria-label': accessibilityLabel }, children),
  StyleSheet: { create: (styles: Record<string, unknown>) => styles, hairlineWidth: 1, absoluteFill: {} },
  Alert: { alert: vi.fn() },
  Platform: { OS: 'ios' },
}));

vi.mock('../../../../src/theme/ios-colors', () => ({
  iosSystemColors: { systemGray4: '#C7C7CC' },
}));
vi.mock('../../../../src/providers/theme-provider', () => ({
  useTheme: () => ({ systemColors: { label: '#000', fill: '#eee' }, brandColors: { primary: '#6D28D9' } }),
}));
vi.mock('../../../../src/providers/auth-provider', () => ({ useAuth: () => ({ isAuthenticated: true }) }));
vi.mock('../../../../src/providers/toast-provider', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../../../../src/lib/playlists/use-playlist-activation', () => ({ usePlaylistActivation: () => vi.fn() }));
vi.mock('../../../../src/lib/playlists/use-playlist-render-board', () => ({
  usePlaylistRenderBoard: () => ({ renderBoard: null, banner: null }),
}));
vi.mock('../../../../src/lib/playlists/recents-store', () => ({ recordPlaylistOpen: vi.fn() }));
vi.mock('../../../../src/lib/climb-types', () => ({ toQueueClimbs: (climbs: unknown) => climbs }));
vi.mock('../../../../src/lib/haptics', () => ({ hapticSelection: vi.fn() }));

vi.mock('../../../../src/components/Text', () => ({
  Text: ({ children }: { children?: ReactNode }) => createElement('span', null, children),
}));
vi.mock('../../../../src/components/Icon', () => ({
  Icon: ({ name }: { name: string }) => createElement('span', { 'data-icon': name }),
}));
vi.mock('../../../../src/components/ClimbListRowSkeleton', () => ({
  ClimbListRowSkeleton: () => createElement('div', { 'data-skeleton': 'true' }),
}));
vi.mock('../../../../src/components/GlassIconButton', () => ({
  GlassIconButton: () => createElement('div', { 'data-glass-button': 'true' }),
}));
// PlaylistDetailView surfaces the hero title so we can prove the error branch
// renders *instead of* a fallback-titled hero.
vi.mock('../../../../src/components/playlist', () => ({
  PlaylistDetailView: ({ hero }: { hero: { name: string } }) =>
    createElement('div', { 'data-detail-view': 'true', 'data-hero-name': hero.name }),
  SKELETON_PLACEHOLDERS: ['a', 'b'],
  PlaylistFormSheet: () => null,
  PlaylistActionsMenu: () => null,
  PlaylistFollowButton: () => null,
  PlaylistEditDoneButton: () => null,
  PlaylistOwnerToolbar: () => null,
  PlaylistBackFab: () => createElement('div', { 'data-back-fab': 'true' }),
}));

import PlaylistDetail from '../[playlist_uuid]';

function renderDetail() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <PlaylistDetail />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  requestMock.mockReset();
  climbsRefetch.mockClear();
});

describe('PlaylistDetail metadata error handling', () => {
  it('renders an error + retry state (not a fallback-titled hero) when GET_PLAYLIST rejects', async () => {
    // react-query leaves data undefined (never null) on a thrown error.
    requestMock.mockRejectedValue(new Error('network down'));

    const { findByText, queryByText, container } = renderDetail();

    expect(await findByText('detail.errors.loadTitle')).toBeTruthy();
    // The PlaylistDetailView (and its fallback-titled hero) must NOT render in
    // its place.
    expect(container.querySelector('[data-detail-view="true"]')).toBeNull();
    expect(queryByText('metadata.detail.fallbackTitle')).toBeNull();
  });

  it('retries both the metadata and climbs queries from the error state', async () => {
    requestMock.mockRejectedValue(new Error('network down'));

    const { findByLabelText } = renderDetail();
    const retry = await findByLabelText('detail.errors.tryAgain');

    requestMock.mockResolvedValue({ playlist: null });
    fireEvent.click(retry);

    // The metadata query refetches (request fires again) and the climbs query
    // is told to refetch too.
    await waitFor(() => expect(requestMock).toHaveBeenCalledTimes(2));
    expect(climbsRefetch).toHaveBeenCalledTimes(1);
  });

  it('renders the not-found state (not the load-error state) when GET_PLAYLIST resolves null', async () => {
    requestMock.mockResolvedValue({ playlist: null });

    const { findByText, queryByText } = renderDetail();

    expect(await findByText('detail.errors.notFoundTitle')).toBeTruthy();
    expect(queryByText('detail.errors.loadTitle')).toBeNull();
  });
});
