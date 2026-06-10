// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';

type PlaylistItem = { uuid: string; name: string; climbCount: number; creatorId?: string };

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
const discoverHook = vi.hoisted(() => ({
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
  useDiscoverPlaylists: () => discoverHook,
  usePinnedPlaylists: () => ({ pinned: [], refetch: vi.fn() }),
  useSmartPlaylistCounts: () => ({ data: [], isLoading: false }),
  usePlaylistMutations: () => ({ createPlaylist, pinPlaylist: vi.fn(), unpinPlaylist: vi.fn() }),
}));

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
vi.mock('../../../../src/lib/smart-playlists', () => ({ SMART_PLAYLISTS: [] }));

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
vi.mock('../../../../src/components/playlist', () => ({
  PlaylistCard: ({ name }: { name: string }) => createElement('div', { 'data-card': name }),
  PlaylistScrollSection: ({ children, title }: { children?: ReactNode; title: string }) =>
    createElement('div', { 'data-scroll-section': title }, children),
  PlaylistFormSheet: () => createElement('div', { 'data-form-sheet': 'true' }),
}));
vi.mock('../../../../src/components/chrome', () => ({
  DiscoverTopChrome: () => createElement('div', { 'data-chrome': 'true' }),
}));

import DiscoverLibrary from '../index';

beforeEach(() => {
  userHook.playlists = [];
  userHook.isLoading = false;
  userHook.hasError = false;
  userHook.refetch.mockClear();
  discoverHook.popular = [];
  discoverHook.recent = [];
  discoverHook.isLoading = false;
  discoverHook.hasError = false;
  discoverHook.refetch.mockClear();
});

describe('DiscoverLibrary error handling', () => {
  it('shows a load-error state with a retry (not the empty state) when a section fails and the hub is empty', () => {
    userHook.hasError = true;
    const { getByText, queryByText, getByLabelText } = render(<DiscoverLibrary />);

    expect(getByText('library.errors.loadTitle')).toBeTruthy();
    // Must not fall through to the misleading "no playlists yet" empty copy.
    expect(queryByText('library.empty.title')).toBeNull();

    fireEvent.click(getByLabelText('library.errors.tryAgain'));
    expect(userHook.refetch).toHaveBeenCalledTimes(1);
  });

  it('retries only the discover stream when only it failed', () => {
    discoverHook.hasError = true;
    const { getByLabelText } = render(<DiscoverLibrary />);

    fireEvent.click(getByLabelText('library.errors.tryAgain'));
    expect(discoverHook.refetch).toHaveBeenCalledTimes(1);
    expect(userHook.refetch).not.toHaveBeenCalled();
  });

  it('keeps showing content (no error block) when a section errored but data is present', () => {
    userHook.hasError = true;
    userHook.playlists = [{ uuid: 'a', name: 'Alpha', climbCount: 1 }];
    const { queryByText } = render(<DiscoverLibrary />);

    expect(queryByText('library.errors.loadTitle')).toBeNull();
  });

  it('still shows the empty state (not an error) when both sections succeed with no playlists', () => {
    const { getByText, queryByText } = render(<DiscoverLibrary />);

    expect(getByText('library.empty.title')).toBeTruthy();
    expect(queryByText('library.errors.loadTitle')).toBeNull();
  });
});
