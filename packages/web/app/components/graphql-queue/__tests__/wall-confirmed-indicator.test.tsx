import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Climb } from '@/app/lib/types';
import type { ClimbQueueItem } from '../../queue-control/types';
import { MockRootQueueProvider, useMockRootQueueState } from '@/app/test-utils/mock-persistent-session-queue';

// Verifies the QueueContext surfaces the session-scoped wall-lit indicator
// (`SessionDataType.wallConfirmed`) by reflecting the root persistent-session
// `isSessionWallLit` value, and that toggling it never clears the current climb.
// The event-driven state machine (WallConfirmedClimb -> on, WallDisconnected ->
// off) is owned by, and tested at, the persistent-session provider.

vi.mock('@/app/components/providers/snackbar-provider', () => ({
  useSnackbar: () => ({ showMessage: vi.fn() }),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/kilter/1/1/1/40',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

vi.mock('../../queue-control/hooks/use-queue-data-fetching', () => ({
  useQueueDataFetching: () => ({
    climbSearchResults: null,
    suggestedClimbs: [],
    totalSearchResultCount: 0,
    hasMoreResults: false,
    isFetchingClimbs: false,
    isFetchingNextPage: false,
    fetchMoreClimbs: vi.fn(),
    climbUuids: [],
  }),
}));

const mockPersistentSession = {
  activeSession: {
    sessionId: 'session-1',
    boardPath: '/kilter/1/1/1/40',
    boardDetails: {},
    parsedParams: {},
  } as {
    sessionId: string;
    boardPath: string;
    boardDetails: unknown;
    parsedParams: unknown;
  } | null,
  session: {
    clientId: 'client-1',
    participantId: 'participant-1',
    isLeader: false,
    users: [],
    goal: null,
  },
  isConnecting: false,
  hasConnected: true,
  error: null,
  clientId: 'client-1',
  participantId: 'participant-1',
  isLeader: false,
  users: [],
  isSessionWallLit: false,
  // W6: queue/currentClimbQueueItem/playlistSuggestionSource + dispatch come
  // from the MockRootQueueProvider (real reducer) via the factory below.
  soloBoardPath: null,
  soloBoardDetails: null,
  isSessionRestoreComplete: true,
  setBoardContext: vi.fn(),
  activateSession: vi.fn(),
  deactivateSession: vi.fn(),
  setInitialQueueForSession: vi.fn(),
  addQueueItem: vi.fn().mockResolvedValue(undefined),
  removeQueueItem: vi.fn().mockResolvedValue(undefined),
  setCurrentClimb: vi.fn().mockResolvedValue(undefined),
  mirrorCurrentClimb: vi.fn().mockResolvedValue(undefined),
  setQueue: vi.fn().mockResolvedValue(undefined),
  replaceQueueItem: vi.fn().mockResolvedValue(undefined),
  confirmClimbOnWall: vi.fn().mockResolvedValue(undefined),
  reportWallDisconnect: vi.fn().mockResolvedValue(undefined),
  setSessionBoardSerial: vi.fn().mockResolvedValue(undefined),
  offlineBufferRef: { current: [] as unknown[] },
  lastReceivedSequenceRef: { current: null as number | null },
  subscribeToQueueEvents: vi.fn(() => vi.fn()),
  subscribeToSessionEvents: vi.fn(() => vi.fn()),
  triggerResync: vi.fn(),
  endSessionWithSummary: vi.fn(),
  sessionSummary: null,
  sessionSummaryBoardType: null,
  sessionSummaryHealthKitWorkoutId: null,
  sessionSummaryAutoFinished: false,
  setAutoFinishedSummary: vi.fn(),
  dismissSessionSummary: vi.fn(),
};

vi.mock('../../connection-manager/websocket-connection-provider', () => ({
  useWebSocketConnection: () => ({ state: 'connected', name: 'session' }),
}));

vi.mock('../../party-manager/party-profile-context', () => ({
  usePartyProfile: () => ({ profile: { id: 'user-1' }, username: 'tester', avatarUrl: undefined }),
}));

vi.mock('../../connection-manager/connection-settings-context', () => ({
  useConnectionSettings: () => ({ backendUrl: 'wss://example.com/graphql' }),
}));

// W6: queue state is root-owned. The mocked hooks merge the shared reducer's
// live `state` + stable `dispatch` (from the MockRootQueueProvider in the test
// wrapper) onto the static session mock. Mutations dispatch to a real reducer;
// toggling `isSessionWallLit` on the mock is read back on the next render.
vi.mock('../../persistent-session', () => ({
  usePersistentSession: () => {
    const rootQueue = useMockRootQueueState();
    return { ...mockPersistentSession, ...rootQueue.state, dispatch: rootQueue.dispatch };
  },
  usePersistentSessionState: () => {
    const rootQueue = useMockRootQueueState();
    return { ...mockPersistentSession, ...rootQueue.state, dispatch: rootQueue.dispatch };
  },
  usePersistentSessionActions: () => {
    const rootQueue = useMockRootQueueState();
    return { ...mockPersistentSession, ...rootQueue.state, dispatch: rootQueue.dispatch };
  },
  PersistentSessionProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('../../climb-actions/favorites-batch-context', () => ({
  FavoritesProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('../../climb-actions/playlists-batch-context', () => ({
  PlaylistsProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('@/app/hooks/use-climb-actions-data', () => ({
  useClimbActionsData: () => ({ favoritesProviderProps: {}, playlistsProviderProps: {} }),
}));

vi.mock('@/app/hooks/use-ws-auth-token', () => ({
  useWsAuthToken: () => ({ token: 'mock-token', isLoading: false }),
}));

vi.mock('@/app/lib/climb-session-cookie', () => ({
  getClimbSessionCookie: () => 'session-1',
  setClimbSessionCookie: vi.fn(),
  clearClimbSessionCookie: vi.fn(),
}));

vi.mock('@/app/lib/session-history-db', () => ({ saveSessionToHistory: vi.fn() }));

vi.mock('@/app/lib/graphql/client', () => ({
  createGraphQLHttpClient: vi.fn(() => ({ request: vi.fn() })),
}));

vi.mock('../../session-summary/session-summary-dialog', () => ({ default: () => null }));

// Import AFTER mocks
import { GraphQLQueueProvider, useQueueContext } from '../QueueContext';

function makeClimb(uuid: string): Climb {
  return {
    uuid,
    setter_username: 'setter',
    name: `Climb ${uuid}`,
    description: '',
    frames: '',
    angle: 40,
    ascensionist_count: 5,
    difficulty: '7',
    quality_average: '3.5',
    stars: 3,
    difficulty_error: '',
    mirrored: false,
    benchmark_difficulty: null,
    userAscents: 0,
    userAttempts: 0,
  };
}

const defaultProps = {
  parsedParams: {
    board_name: 'kilter',
    layout_id: '1',
    size_id: '1',
    set_ids: ['1'],
    angle: '40',
  } as never,
  boardDetails: {
    board_name: 'kilter',
    layout_id: 1,
    size_id: 1,
    set_ids: '1',
    images_to_holds: {},
    layout_name: 'Original',
    size_name: '12x12',
    size_description: 'Standard',
    set_names: ['Base'],
    edge_left: 0,
    edge_right: 0,
    edge_bottom: 0,
    edge_top: 0,
  } as never,
};

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MockRootQueueProvider>
          <GraphQLQueueProvider {...defaultProps}>{children}</GraphQLQueueProvider>
        </MockRootQueueProvider>
      </QueryClientProvider>
    );
  };
}

describe('Session-scoped wall-confirmed indicator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPersistentSession.isSessionWallLit = false;
  });

  it('reflects the root persistent-session isSessionWallLit, and toggling it never clears the current climb', () => {
    mockPersistentSession.isSessionWallLit = false;
    const { result, rerender } = renderHook(() => useQueueContext(), { wrapper: createWrapper() });

    expect(result.current.isPersistentSessionActive).toBe(true);
    expect(result.current.wallConfirmed).toBe(false);

    // Seed a current climb so we can assert it survives an indicator toggle.
    const item: ClimbQueueItem = { uuid: 'queue-item-1', climb: makeClimb('climb-1'), suggested: false };
    act(() => {
      result.current.setCurrentClimbQueueItem(item);
    });
    expect(result.current.currentClimb?.uuid).toBe('climb-1');

    // Persistent-session reports the wall lit (a member relayed the climb) →
    // wallConfirmed mirrors it; the current climb is untouched.
    mockPersistentSession.isSessionWallLit = true;
    rerender();
    expect(result.current.wallConfirmed).toBe(true);
    expect(result.current.currentClimb?.uuid).toBe('climb-1');

    // Persistent-session reports the wall dark (a member's BLE dropped) →
    // wallConfirmed mirrors it; the current climb is still preserved.
    mockPersistentSession.isSessionWallLit = false;
    rerender();
    expect(result.current.wallConfirmed).toBe(false);
    expect(result.current.currentClimb?.uuid).toBe('climb-1');
  });
});
