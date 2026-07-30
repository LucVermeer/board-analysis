// @vitest-environment jsdom
//
// #3897, second surface. My Boards has TWO offline failures and the profile is the
// fatal one: `useProfile` is a plain network query, so with no signal `currentUserId`
// is undefined and the guard `(isError && myBoards.length === 0) || !currentUserId`
// fired the hard "Something went wrong / Try again" state — regardless of anything
// done to the board list. Offline the screen now renders a flat list of the boards
// this device downloaded (owned-vs-followed can't be classified without the profile
// id, so the headers are dropped rather than guessed) with the network affordances
// hidden.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import type { UserBoard } from '@boardsesh/shared-schema';

type Children = { children?: ReactNode };
type ButtonProps = { title: string; onPress?: () => void };
type ManageRowProps = { board: UserBoard; readOnly?: boolean; downloadState?: string };

const routerMock = vi.hoisted(() => ({ push: vi.fn() }));
const setOptionsMock = vi.hoisted(() => vi.fn());

const state = vi.hoisted(() => ({
  isOffline: false,
  profileId: undefined as string | undefined,
  isProfileLoading: false,
  offlineCards: [] as unknown[],
  enabledBoards: [] as string[],
  downloadedScopeKeys: [] as string[],
  activeBoard: undefined as unknown,
  myBoards: {
    data: undefined as { boards: unknown[] } | undefined,
    isLoading: false,
    isError: false,
    isRefetching: false,
  },
}));

const board = (overrides: Partial<UserBoard> & { uuid: string; name: string }): UserBoard =>
  ({
    boardType: 'kilter',
    layoutId: 8,
    sizeId: 17,
    setIds: '20,21',
    angle: 40,
    isOwned: true,
    ownerId: 'me',
    ...overrides,
  }) as unknown as UserBoard;

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  View: ({ children }: Children) => createElement('div', null, children),
  Pressable: ({ children, onPress }: Children & { onPress?: () => void }) =>
    createElement('button', { onClick: onPress, type: 'button' }, children),
  RefreshControl: () => null,
  StyleSheet: { create: (styles: Record<string, unknown>) => styles, hairlineWidth: 1 },
}));

vi.mock('@shopify/flash-list', () => ({
  FlashList: ({
    data,
    renderItem,
    ListHeaderComponent,
    ListEmptyComponent,
  }: {
    data: { key: string }[];
    renderItem: (input: { item: unknown }) => ReactNode;
    ListHeaderComponent?: ReactNode;
    ListEmptyComponent?: ReactNode;
  }) =>
    createElement(
      'div',
      { 'data-testid': 'list' },
      ListHeaderComponent,
      data.length === 0
        ? ListEmptyComponent
        : data.map((item) => createElement('div', { key: item.key }, renderItem({ item }))),
    ),
}));

vi.mock('expo-router', () => ({
  useRouter: () => routerMock,
  useNavigation: () => ({ setOptions: setOptionsMock }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'en-US' },
    t: (key: string) => {
      const map: Record<string, string> = {
        'mobile.errorTitle': 'Something went wrong',
        'mobile.errorRetry': 'Try again',
        'mobile.emptyTitle': 'No boards yet',
        'mobile.emptySubtitle': 'Search for a board to get started',
        'mobile.discovery.create': 'Create a board',
        'mobile.manage.ownedHeader': 'Your boards',
        'mobile.manage.followingHeader': 'Following',
        'mobile.manage.edit': 'Edit',
        'mobile.offline.pickerNotice': "No signal — here are the boards you've downloaded.",
      };
      return map[key] ?? key;
    },
  }),
}));

vi.mock('expo-sqlite', () => ({ useSQLiteContext: () => ({}) }));

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: state.downloadedScopeKeys, refetch: vi.fn() }),
}));

vi.mock('@boardsesh/offline-sync', () => ({
  getDownloadedScopeKeys: vi.fn(async () => state.downloadedScopeKeys),
  getCheckpoint: vi.fn(async () => null),
  getCheckpointKey: (table: string, key: string) => `${table}:${key}`,
  getBootstrapAttempts: vi.fn(async () => 0),
  estimateScopeDownload: () => ({ kind: 'unknown' }),
  offlineBoardKeyForBoard: (input: { boardType: string; layoutId: number; sizeId: number }) =>
    `${input.boardType}:${input.layoutId}:${input.sizeId}`,
}));

vi.mock('../../../src/lib/graphql/hooks', () => ({
  useMyBoards: () => ({ ...state.myBoards, refetch: vi.fn() }),
  useProfile: () => ({
    data: state.profileId ? { id: state.profileId } : undefined,
    isLoading: state.isProfileLoading,
    isError: false,
    refetch: vi.fn(),
  }),
  useDeleteBoard: () => ({ isPending: false, variables: undefined, mutateAsync: vi.fn() }),
  useUnfollowBoard: () => ({ isPending: false, variables: undefined, mutateAsync: vi.fn() }),
}));

vi.mock('../../../src/lib/graphql/use-active-board', () => ({
  useActiveBoard: () => ({ data: state.activeBoard }),
  useClearActiveBoard: () => vi.fn(),
}));

vi.mock('../../../src/providers/auth-provider', () => ({
  useAuth: () => ({ isAuthenticated: true, refreshAuthState: vi.fn() }),
}));
vi.mock('../../../src/providers/toast-provider', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../../../src/providers/dialog-provider', () => ({ useConfirm: () => vi.fn().mockResolvedValue(false) }));
vi.mock('../../../src/providers/theme-provider', () => ({
  useTheme: () => ({
    systemColors: {
      background: '#fff',
      secondaryBackground: '#eee',
      tertiaryBackground: '#ddd',
      label: '#000',
      secondaryLabel: '#666',
      tertiaryLabel: '#999',
      separator: '#ccc',
    },
    brandColors: { primary: '#6D28D9', onPrimary: '#fff' },
  }),
}));
vi.mock('../../../src/providers/feature-flags-provider', () => ({ useOfflineDownloadsEnabled: () => true }));
vi.mock('../../../src/hooks/use-bottom-chrome-metrics', () => ({
  useBottomChromeMetrics: () => ({ scrollBottomPadding: 0 }),
}));
vi.mock('../../../src/hooks/use-is-offline', () => ({ useIsOffline: () => state.isOffline }));
vi.mock('../../../src/sync', () => ({ useSyncStatus: () => ({ isSyncing: false, progress: null }) }));
vi.mock('../../../src/offline/use-board-downloads', () => ({
  useBoardDownloads: () => ({ enableBoardsOffline: vi.fn() }),
}));
vi.mock('../../../src/offline/use-remember-downloaded-boards', () => ({
  useRememberDownloadedBoards: vi.fn(),
}));
vi.mock('../../../src/offline/use-snapshot-manifest', () => ({ useSnapshotManifest: () => null }));
vi.mock('../../../src/lib/format-bytes', () => ({ formatBytes: (bytes: number) => `${bytes} B` }));
vi.mock('../../../src/lib/haptics', () => ({ hapticSelection: vi.fn() }));
vi.mock('../../../src/settings', () => ({
  getSetting: () => state.enabledBoards,
  useSetting: () => [state.enabledBoards, vi.fn()],
  setOfflineBoardEnabled: vi.fn(),
  forgetOfflineBoardScope: vi.fn(),
  useOfflineBoards: () => state.offlineCards,
  offlineBoardKeyForBoard: (input: { boardType: string; layoutId: number; sizeId: number }) =>
    `${input.boardType}:${input.layoutId}:${input.sizeId}`,
  offlineBoardScopeForBoard: (input: { boardType: string; layoutId: number; sizeId: number }) => ({
    boardType: input.boardType,
    layoutId: input.layoutId,
    sizeId: input.sizeId,
  }),
}));

vi.mock('../../../src/theme/tokens', () => ({
  spacing: { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 8: 32, 16: 64 },
}));
vi.mock('../../../src/theme/ios-colors', () => ({
  iosSystemColors: { systemGray: '#8e8e93', systemRed: '#f00' },
}));

vi.mock('../../../src/components/Text', () => ({
  Text: ({ children }: Children) => createElement('span', null, children),
}));
vi.mock('../../../src/components/Icon', () => ({
  Icon: ({ name }: { name: string }) => createElement('i', { 'data-icon': name }),
}));
vi.mock('../../../src/components/Button', () => ({
  Button: ({ title, onPress }: ButtonProps) => createElement('button', { onClick: onPress, type: 'button' }, title),
}));
vi.mock('../../../src/components/ActivityIndicator', () => ({
  ActivityIndicator: () => createElement('div', { 'data-testid': 'spinner' }),
}));
vi.mock('../../../src/components/board-discovery/BoardManageRow', () => ({
  BoardManageRow: ({ board: rowBoard, readOnly, downloadState }: ManageRowProps) =>
    createElement(
      'div',
      { 'data-board': rowBoard.uuid, 'data-readonly': String(!!readOnly), 'data-download-state': downloadState ?? '' },
      rowBoard.name,
    ),
}));

const { default: ManageBoards } = await import('../manage');

beforeEach(() => {
  vi.clearAllMocks();
  state.isOffline = false;
  state.profileId = undefined;
  state.isProfileLoading = false;
  state.offlineCards = [];
  state.enabledBoards = [];
  state.downloadedScopeKeys = [];
  state.activeBoard = undefined;
  state.myBoards = { data: undefined, isLoading: false, isError: false, isRefetching: false };
});

describe('My Boards with no usable network list', () => {
  it('renders the downloaded boards instead of the hard error state when the profile is missing', () => {
    state.isOffline = true;
    state.offlineCards = [board({ uuid: 'board-a', name: 'Marco garage' })];
    state.downloadedScopeKeys = ['kilter:8:17'];

    render(createElement(ManageBoards));

    // On today's code `!currentUserId` short-circuits straight to the error state.
    expect(screen.getByText('Marco garage')).toBeTruthy();
    expect(screen.queryByText('Something went wrong')).toBeNull();
    expect(screen.queryByText('Try again')).toBeNull();
    expect(screen.getByText("No signal — here are the boards you've downloaded.")).toBeTruthy();
  });

  it('hides the network-only affordances: Create, Edit, and the per-row mutations', () => {
    state.isOffline = true;
    state.offlineCards = [board({ uuid: 'board-a', name: 'Marco garage' })];
    state.enabledBoards = ['kilter:8:17'];
    state.downloadedScopeKeys = ['kilter:8:17'];

    render(createElement(ManageBoards));

    expect(screen.queryByRole('button', { name: 'Create a board' })).toBeNull();
    expect(document.querySelector('[data-board="board-a"]')?.getAttribute('data-readonly')).toBe('true');
    // The header Edit button only reveals delete/unfollow, both server mutations.
    expect(setOptionsMock.mock.calls.at(-1)?.[0]?.headerRight).toBeUndefined();
    // The local offline toggle keeps working — its state comes off disk, not the wire.
    expect(document.querySelector('[data-board="board-a"]')?.getAttribute('data-download-state')).toBe('downloaded');
  });

  it('leaves the owned/followed split and the Create button alone online', () => {
    state.profileId = 'me';
    state.myBoards = {
      data: { boards: [board({ uuid: 'net-1', name: 'Network board' })] },
      isLoading: false,
      isError: false,
      isRefetching: false,
    };
    state.offlineCards = [board({ uuid: 'board-a', name: 'Marco garage' })];
    state.downloadedScopeKeys = ['kilter:8:17'];

    render(createElement(ManageBoards));

    expect(screen.getByText('Your boards')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create a board' })).toBeTruthy();
    expect(screen.getByText('Network board')).toBeTruthy();
    expect(screen.queryByText('Marco garage')).toBeNull();
    expect(document.querySelector('[data-board="net-1"]')?.getAttribute('data-readonly')).toBe('false');
  });

  it('still shows the retry state offline when nothing has been downloaded', () => {
    state.isOffline = true;

    render(createElement(ManageBoards));

    expect(screen.getByText('Something went wrong')).toBeTruthy();
  });
});
