import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/app/test-utils/test-providers';
import type { AscentFeedItem, LayoutStats } from '@boardsesh/graphql/operations/ticks';
import type { BoardDetails, Climb } from '@/app/lib/types';
import { tFromCatalog } from '@/app/__test-helpers__/i18n-mock';
import LogbookFeed from '../logbook-feed';

type LogbookListItemProps = {
  centerBottomSlot?: React.ReactNode;
  belowContentSlot?: React.ReactNode;
  menuSlot?: React.ReactNode;
  disableFavorite?: boolean;
  disableSelection?: boolean;
  disableSwipe?: boolean;
};

type ClimbsListMockProps = {
  climbs: Climb[];
  onClimbSelect?: (climb: Climb, index: number) => void;
  getItemKey?: (climb: Climb, index: number) => string | number;
  getListItemProps?: (climb: Climb, index: number, boardDetails: BoardDetails) => LogbookListItemProps;
  forcedViewMode?: 'list' | 'grid';
  showSwipeHint?: boolean;
  listOverscan?: number;
};

const feedTestState = vi.hoisted(() => ({
  mockRequest: vi.fn(),
  getPreferenceMock: vi.fn(),
  replaceMock: vi.fn(),
  showMessageSpy: vi.fn(),
  trackMock: vi.fn(),
  lastClimbsListProps: null as unknown,
}));

const mockBoardDetails = vi.hoisted(
  () =>
    ({
      board_name: 'kilter',
      layout_id: 1,
      size_id: 10,
      set_ids: [1],
      images_to_holds: {},
      holdsData: [],
      edge_left: 0,
      edge_right: 100,
      edge_bottom: 0,
      edge_top: 100,
      boardHeight: 100,
      boardWidth: 100,
    }) as BoardDetails,
);

vi.mock('react-i18next', () => ({
  useTranslation: (namespace?: string) => ({
    t: (key: string, options?: Record<string, unknown>) => tFromCatalog(namespace, key, options),
    i18n: { language: 'en-US' },
  }),
  Trans: ({ children }: { children?: React.ReactNode }) => children ?? null,
}));

vi.mock('../library.module.css', () => ({
  default: new Proxy({}, { get: (_target, property) => String(property) }),
}));

vi.mock('@/app/lib/graphql/client', () => ({
  createGraphQLHttpClient: () => ({ request: feedTestState.mockRequest }),
}));

vi.mock('@/app/lib/backend-url', () => ({
  getBackendHttpUrl: () => 'http://backend.test',
  getBackendWsUrl: () => 'ws://backend.test',
}));

vi.mock('@boardsesh/graphql/operations/ticks', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@boardsesh/graphql/operations/ticks');
  return {
    ...actual,
    GET_USER_ASCENTS_FEED: 'GET_USER_ASCENTS_FEED',
    DELETE_TICK: 'DELETE_TICK',
  };
});

vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { id: 'user-1' } } }),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/you/logbook',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: feedTestState.replaceMock, push: vi.fn() }),
}));

vi.mock('@/app/hooks/use-ws-auth-token', () => ({
  useWsAuthToken: () => ({
    token: 'test-token',
    isAuthenticated: true,
    isLoading: false,
    error: null,
  }),
}));

vi.mock('@/app/lib/user-preferences-db', () => ({
  getPreference: (...args: unknown[]) => feedTestState.getPreferenceMock(...args),
  setPreference: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/app/components/providers/snackbar-provider', () => ({
  useSnackbar: () => ({ showMessage: feedTestState.showMessageSpy }),
}));

vi.mock('@/app/lib/instagram-posting', () => ({
  isInstagramPostingSupported: () => false,
}));

vi.mock('@/app/profile/[user_id]/utils/profile-constants', () => ({
  getLayoutDisplayName: (boardType: string, layoutId: number | null) => `${boardType}-${layoutId ?? 'unknown'}`,
}));

vi.mock('@boardsesh/board-constants/product-sizes', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    getDefaultSizeForLayout: () => 10,
    getSetsForLayoutAndSize: () => [{ id: 1, name: 'All' }],
  };
});

vi.mock('@/app/lib/moonboard-config', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    getLayoutById: () => null,
    MOONBOARD_SETS: {},
  };
});

vi.mock('@/app/hooks/use-board-details-map', () => ({
  useBoardDetailsMap: () => ({
    boardDetailsByClimb: {},
    defaultBoardDetails: mockBoardDetails,
    unsupportedClimbs: new Set<string>(),
    upsizedClimbs: new Set<string>(),
  }),
}));

vi.mock('@/app/hooks/use-climb-actions-data', () => ({
  useClimbActionsData: () => ({
    favoritesProviderProps: { favoriteClimbUuids: new Set<string>(), addFavorite: vi.fn(), removeFavorite: vi.fn() },
    playlistsProviderProps: { playlistsByClimbUuid: {}, refetchPlaylists: vi.fn() },
  }),
}));

vi.mock('@/app/components/climb-actions/favorites-batch-context', () => ({
  FavoritesProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('@/app/components/climb-actions/playlists-batch-context', () => ({
  PlaylistsProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('@/app/components/board-page/climbs-list', () => ({
  default: (props: ClimbsListMockProps) => {
    feedTestState.lastClimbsListProps = props;
    return (
      <div
        data-testid="climbs-list"
        data-forced-view-mode={props.forcedViewMode}
        data-list-overscan={props.listOverscan}
        data-show-swipe-hint={String(props.showSwipeHint)}
      >
        {props.climbs.map((climb, index) => {
          const itemProps = props.getListItemProps?.(climb, index, mockBoardDetails);
          const itemKey = props.getItemKey?.(climb, index) ?? climb.uuid;
          return (
            <div
              key={itemKey}
              data-testid="climb-row"
              data-key={String(itemKey)}
              data-disable-swipe={String(itemProps?.disableSwipe)}
              data-disable-selection={String(itemProps?.disableSelection)}
              onClick={() => props.onClimbSelect?.(climb, index)}
            >
              <span>{climb.name}</span>
              {itemProps?.centerBottomSlot}
              {itemProps?.menuSlot}
              {itemProps?.belowContentSlot}
            </div>
          );
        })}
      </div>
    );
  },
}));

vi.mock('../logbook-feed-item', () => ({
  LogbookEntryMeta: ({ item }: { item: AscentFeedItem }) => (
    <div data-testid="entry-meta">
      {item.attemptCount} tries {item.boardType}
    </div>
  ),
  LogbookEntryEditor: ({ item }: { item: AscentFeedItem }) => <div data-testid="entry-editor">editing {item.uuid}</div>,
  LogbookEntryMenu: ({ item }: { item: AscentFeedItem }) => (
    <button type="button" data-testid={`entry-menu-${item.uuid}`}>
      menu
    </button>
  ),
}));

vi.mock('../logbook-item-skeleton', () => ({
  default: () => <div data-testid="logbook-skeleton" />,
}));

vi.mock('../logbook-search-form', () => ({
  default: () => <div data-testid="logbook-search-form" />,
}));

vi.mock('@mui/material/useMediaQuery', () => ({
  default: () => false,
}));

vi.mock('@/app/lib/analytics', () => ({
  track: feedTestState.trackMock,
}));

function makeLayoutStats(): LayoutStats {
  return {
    layoutKey: 'kilter-1',
    boardType: 'kilter',
    layoutId: 1,
    distinctClimbCount: 10,
    gradeCounts: [],
  };
}

function makeAscentItem(index: number, overrides: Partial<AscentFeedItem> = {}): AscentFeedItem {
  return {
    uuid: `tick-${index}`,
    climbUuid: `climb-${index}`,
    climbName: `Test Climb ${index}`,
    setterUsername: null,
    boardType: 'kilter',
    layoutId: 1,
    angle: 40,
    isMirror: false,
    status: 'send',
    attemptCount: index + 1,
    quality: 4,
    difficulty: 20,
    difficultyName: '7a/V6',
    consensusDifficulty: 20,
    consensusDifficultyName: '7a/V6',
    qualityAverage: 3.5,
    isBenchmark: false,
    isNoMatch: false,
    comment: '',
    climbedAt: new Date('2026-04-01T12:00:00Z').toISOString(),
    frames: 'p1r14',
    ...overrides,
  };
}

function renderFeed(items: AscentFeedItem[]) {
  feedTestState.mockRequest.mockResolvedValue({
    userAscentsFeed: { items, hasMore: false },
  });

  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <LogbookFeed layoutStats={[makeLayoutStats()]} loadingLayoutStats={false} />
    </QueryClientProvider>,
  );
}

function getLastClimbsListProps(): ClimbsListMockProps {
  return feedTestState.lastClimbsListProps as ClimbsListMockProps;
}

beforeEach(() => {
  feedTestState.mockRequest.mockReset();
  feedTestState.getPreferenceMock.mockReset();
  feedTestState.getPreferenceMock.mockResolvedValue(null);
  feedTestState.replaceMock.mockReset();
  feedTestState.showMessageSpy.mockReset();
  feedTestState.trackMock.mockReset();
  feedTestState.lastClimbsListProps = null;
});

describe('LogbookFeed shared climb list rendering', () => {
  it('passes all feed items to ClimbsList with list-only logbook config', async () => {
    renderFeed([makeAscentItem(1), makeAscentItem(2)]);

    const climbList = await screen.findByTestId('climbs-list');
    const rows = screen.getAllByTestId('climb-row');

    expect(rows).toHaveLength(2);
    expect(climbList.getAttribute('data-forced-view-mode')).toBe('list');
    expect(climbList.getAttribute('data-show-swipe-hint')).toBe('false');
    expect(getLastClimbsListProps().listOverscan).toBe(10);
    expect(rows[0]?.getAttribute('data-disable-swipe')).toBe('true');
    expect(screen.getAllByTestId('entry-meta')[0]?.textContent).toContain('2 tries kilter');
  });

  it('uses tick UUIDs as item keys when two log rows share a climb UUID', async () => {
    renderFeed([
      makeAscentItem(1, { uuid: 'tick-a', climbUuid: 'shared-climb' }),
      makeAscentItem(2, { uuid: 'tick-b', climbUuid: 'shared-climb' }),
    ]);

    await screen.findByTestId('climbs-list');
    const keys = screen.getAllByTestId('climb-row').map((row) => row.getAttribute('data-key'));

    expect(keys).toEqual(['tick-a', 'tick-b']);
  });

  it('opens the inline editor on a regular row tap', async () => {
    renderFeed([makeAscentItem(1, { uuid: 'tick-to-edit' })]);

    const row = await screen.findByTestId('climb-row');
    fireEvent.click(row);

    await waitFor(() => {
      expect(screen.getByTestId('entry-editor').textContent).toContain('tick-to-edit');
    });
    expect(getLastClimbsListProps().listOverscan).toBe(100);
    expect(feedTestState.trackMock).toHaveBeenCalledWith('Logbook Row Edit Opened', {
      climbUuid: 'climb-1',
      tickUuid: 'tick-to-edit',
    });
  });
});
