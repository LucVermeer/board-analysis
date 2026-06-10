// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

type PlaylistItem = {
  uuid: string;
  name: string;
  climbCount: number;
  creatorId?: string;
  creatorName?: string;
  color?: string;
  icon?: string;
};

// Mutable hook return values — each test sets the slice it needs. The two
// section hooks both expose `hasError`; the hub must read them.
const userHook = vi.hoisted(() => ({
  playlists: [] as PlaylistItem[],
  isLoading: false,
  isLoadingMore: false,
  hasError: false,
  loadMore: vi.fn(),
  refetch: vi.fn(),
}));
const forYouHook = vi.hoisted(() => ({
  popular: [] as PlaylistItem[],
  recent: [] as PlaylistItem[],
  isLoading: false,
  isLoadingMore: false,
  hasError: false,
  loadMore: vi.fn(),
  refetch: vi.fn(),
}));
const communityHook = vi.hoisted(() => ({
  popular: [] as PlaylistItem[],
  recent: [] as PlaylistItem[],
  isLoading: false,
  isLoadingMore: false,
  hasError: false,
  loadMore: vi.fn(),
  refetch: vi.fn(),
}));
const createPlaylist = vi.hoisted(() => vi.fn());

vi.mock('@boardsesh/playlists-react', () => ({
  useUserPlaylists: () => userHook,
  useDiscoverPlaylists: (options: { generatedRecommendation?: boolean }) =>
    options.generatedRecommendation ? forYouHook : communityHook,
  usePinnedPlaylists: () => ({ pinned: [], refetch: vi.fn() }),
  useSmartPlaylistCounts: () => ({ data: [], isLoading: false }),
  usePlaylistMutations: () => ({ createPlaylist, pinPlaylist: vi.fn(), unpinPlaylist: vi.fn() }),
}));

// @tanstack/react-query is NOT mocked — the create flow writes to the real
// ['userPlaylists'] cache, which the Add-to-Playlist picker reads, so the test
// asserts against the live cache. Renders are wrapped in a QueryClientProvider.

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('expo-router', () => ({ router: { push: vi.fn() }, useFocusEffect: () => undefined }));
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }));

// Reanimated primitives the hub touches → inert stubs. Animated.ScrollView just
// renders its children so the in-body sections (and our error block) are in DOM.
vi.mock('react-native-reanimated', () => ({
  default: {
    ScrollView: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
  },
  useAnimatedRef: () => ({ current: null }),
  useAnimatedScrollHandler: () => vi.fn(),
  useSharedValue: (initial: unknown) => ({ value: initial }),
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
  Platform: { OS: 'ios' },
}));

vi.mock('../../../../src/theme/tokens', () => ({
  spacing: { 1: 4, 2: 8, 3: 12, 4: 16, 6: 24, 8: 32, 10: 40, 16: 64 },
}));
vi.mock('../../../../src/theme/ios-colors', () => ({
  iosSystemColors: { systemGray: '#8E8E93', systemGray4: '#C7C7CC', separator: '#ddd' },
}));
vi.mock('../../../../src/providers/theme-provider', () => ({
  useTheme: () => ({ brandColors: { primary: '#6D28D9' } }),
}));
vi.mock('../../../../src/providers/auth-provider', () => ({
  useAuth: () => ({ isAuthenticated: true, isLoading: false }),
}));
vi.mock('../../../../src/providers/toast-provider', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));
vi.mock('../../../../src/lib/graphql/use-auth-token', () => ({ useAuthToken: () => ({ data: 'token' }) }));
vi.mock('../../../../src/lib/graphql/hooks', () => ({ useProfile: () => ({ data: { id: 'me' } }) }));
vi.mock('../../../../src/lib/graphql/use-active-board', () => ({
  useActiveBoard: () => ({ data: { boardType: 'kilter', layoutId: 1 } }),
}));
vi.mock('../../../../src/hooks/use-bottom-chrome-metrics', () => ({
  useBottomChromeMetrics: () => ({ scrollBottomPadding: 0 }),
}));
vi.mock('../../../../src/lib/smart-playlists', () => ({
  DEFAULT_PINNED_SMART_PLAYLIST_TYPES: ['LIKED_CLIMBS', 'FIVE_STARS'],
  SMART_PLAYLISTS: [
    {
      type: 'LIKED_CLIMBS',
      slug: 'liked-climbs',
      icon: '❤️',
      color: '#EC4899',
      titleI18nKey: 'library.smart.likedClimbs.title',
    },
    {
      type: 'FIVE_STARS',
      slug: 'five-stars',
      icon: '⭐',
      color: '#FBBF24',
      titleI18nKey: 'library.smart.fiveStars.title',
    },
  ],
}));

vi.mock('../../../../src/components/Text', () => ({
  Text: ({ children }: { children?: ReactNode }) => createElement('span', null, children),
}));
vi.mock('../../../../src/components/Icon', () => ({
  Icon: ({ name }: { name: string }) => createElement('span', { 'data-icon': name }),
}));
vi.mock('../../../../src/components/ActivityIndicator', () => ({
  ActivityIndicator: () => createElement('div', { 'data-spinner': 'true' }),
}));
vi.mock('../../../../src/components/SectionHeader', () => ({
  SectionHeader: ({ title }: { title: string }) => createElement('div', { 'data-section': title }),
}));
// The form sheet exposes a submit button driving onSubmit with fixed form
// values, so the test can trigger the create flow without the real sheet UI.
const FORM_VALUES = { name: 'Crimps', description: '', color: undefined, icon: undefined, isPublic: false };
vi.mock('../../../../src/components/playlist', () => ({
  PlaylistCard: ({ name, metaLabel }: { name: string; metaLabel?: string }) =>
    createElement('div', { 'data-card': name }, metaLabel ? `${name} ${metaLabel}` : name),
  PlaylistScrollSection: ({ children, title }: { children?: ReactNode; title: string }) =>
    createElement('div', { 'data-scroll-section': title }, children),
  PlaylistFormSheet: ({ onSubmit }: { onSubmit: (values: typeof FORM_VALUES) => void }) =>
    createElement('button', { 'aria-label': 'submit-create', onClick: () => onSubmit(FORM_VALUES) }, 'submit'),
}));
// The chrome exposes the create button so the test can open + submit the flow.
vi.mock('../../../../src/components/chrome', () => ({
  DiscoverTopChrome: ({ onCreate }: { onCreate: () => void }) =>
    createElement('button', { 'aria-label': 'open-create', onClick: onCreate }, 'create'),
}));

import DiscoverLibrary from '../index';

// The hub calls useQueryClient(); give it a real client so cache writes/reads
// behave. Surface the client so the create test can read ['userPlaylists'].
function renderHub() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <DiscoverLibrary />
    </QueryClientProvider>,
  );
  return { ...utils, queryClient };
}

beforeEach(() => {
  userHook.playlists = [];
  userHook.isLoading = false;
  userHook.hasError = false;
  userHook.refetch.mockClear();
  forYouHook.popular = [];
  forYouHook.recent = [];
  forYouHook.isLoading = false;
  forYouHook.hasError = false;
  forYouHook.refetch.mockClear();
  communityHook.popular = [];
  communityHook.recent = [];
  communityHook.isLoading = false;
  communityHook.hasError = false;
  communityHook.refetch.mockClear();
  createPlaylist.mockReset();
});

describe('DiscoverLibrary error handling', () => {
  it('shows a load-error state with a retry (not the empty state) when a section fails and the hub is empty', () => {
    userHook.hasError = true;
    const { getByText, queryByText, getByLabelText } = renderHub();

    expect(getByText('library.errors.loadTitle')).toBeTruthy();
    // Must not fall through to the misleading "no playlists yet" empty copy.
    expect(queryByText('library.empty.title')).toBeNull();

    fireEvent.click(getByLabelText('library.errors.tryAgain'));
    expect(userHook.refetch).toHaveBeenCalledTimes(1);
  });

  it('retries only the community stream when only it failed', () => {
    communityHook.hasError = true;
    const { getByLabelText } = renderHub();

    fireEvent.click(getByLabelText('library.errors.tryAgain'));
    expect(communityHook.refetch).toHaveBeenCalledTimes(1);
    expect(forYouHook.refetch).not.toHaveBeenCalled();
    expect(userHook.refetch).not.toHaveBeenCalled();
  });

  it('keeps showing content (no error block) when a section errored but data is present', () => {
    userHook.hasError = true;
    userHook.playlists = [{ uuid: 'a', name: 'Alpha', climbCount: 1 }];
    const { queryByText } = renderHub();

    expect(queryByText('library.errors.loadTitle')).toBeNull();
  });

  it('shows the default smart cards instead of the empty state when all sections succeed with no playlists', () => {
    const { getByText, queryByText } = renderHub();

    expect(getByText('library.smart.likedClimbs.title')).toBeTruthy();
    expect(queryByText('library.empty.title')).toBeNull();
    expect(queryByText('library.errors.loadTitle')).toBeNull();
  });

  it('renders for-you and community playlists from separate discover streams', () => {
    forYouHook.popular = [{ uuid: 'generated', name: 'Fresh for you', climbCount: 4 }];
    communityHook.popular = [
      { uuid: 'community', name: 'Setter picks', climbCount: 7, creatorId: 'creator-2', creatorName: 'Jess' },
    ];

    const { getByText } = renderHub();

    expect(getByText('Fresh for you')).toBeTruthy();
    expect(getByText('Setter picks library.communityByline')).toBeTruthy();
  });
});

describe('DiscoverLibrary create flow', () => {
  it('prepends a created playlist to the ["userPlaylists"] cache the picker reads', async () => {
    const created = {
      id: '99',
      uuid: 'p-new',
      name: 'Crimps',
      climbCount: 0,
      boardType: 'kilter',
      layoutId: 1,
      isPublic: false,
      followerCount: 0,
      isFollowedByMe: false,
      isPinnedByMe: false,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };
    createPlaylist.mockResolvedValue(created);

    const { getByLabelText, queryClient } = renderHub();
    // Seed the picker's cache so the prepend is observable against existing data.
    queryClient.setQueryData(['userPlaylists'], [{ ...created, uuid: 'p-old', name: 'Slopers' }]);

    fireEvent.click(getByLabelText('open-create'));
    await act(async () => {
      fireEvent.click(getByLabelText('submit-create'));
    });

    const cached = queryClient.getQueryData<Array<{ uuid: string }>>(['userPlaylists']);
    expect(cached?.map((playlist) => playlist.uuid)).toEqual(['p-new', 'p-old']);
  });
});
