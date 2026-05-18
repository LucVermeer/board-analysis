import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Climb } from '@/app/lib/types';
import type { SessionEvent } from '@boardsesh/shared-schema';

// --- Mocks must come before importing GraphQLQueueProvider ---

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

// Session-event subscriber registry — tests trigger DriverChanged through
// these callbacks just like the real subscription does.
const sessionEventSubscribers = new Set<(event: SessionEvent) => void>();
function emitSessionEvent(event: SessionEvent) {
  sessionEventSubscribers.forEach((cb) => cb(event));
}

const mockTakeControl = vi.fn().mockResolvedValue(undefined);
const mockTriggerResync = vi.fn();

// Mutable so tests can flip driverParticipantId / participantId.
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
    isLeader: true,
    users: [],
    goal: null,
  },
  isConnecting: false,
  hasConnected: true,
  error: null,
  clientId: 'client-1',
  participantId: 'participant-1',
  isLeader: true,
  driverParticipantId: null as string | null,
  users: [],
  currentClimbQueueItem: null,
  queue: [],
  localQueue: [],
  localCurrentClimbQueueItem: null,
  localBoardPath: null,
  localBoardDetails: null,
  isLocalQueueLoaded: true,
  setLocalQueueState: vi.fn(),
  clearLocalQueue: vi.fn(),
  activateSession: vi.fn(),
  deactivateSession: vi.fn(),
  setInitialQueueForSession: vi.fn(),
  addQueueItem: vi.fn().mockResolvedValue(undefined),
  removeQueueItem: vi.fn().mockResolvedValue(undefined),
  setCurrentClimb: vi.fn().mockResolvedValue(undefined),
  mirrorCurrentClimb: vi.fn().mockResolvedValue(undefined),
  setQueue: vi.fn().mockResolvedValue(undefined),
  replaceQueueItem: vi.fn().mockResolvedValue(undefined),
  takeControl: mockTakeControl,
  releaseControl: vi.fn().mockResolvedValue(undefined),
  confirmClimbOnWall: vi.fn().mockResolvedValue(undefined),
  setSessionBoardSerial: vi.fn().mockResolvedValue(undefined),
  offlineBufferRef: { current: [] as unknown[] },
  lastReceivedSequenceRef: { current: null as number | null },
  subscribeToQueueEvents: vi.fn(() => vi.fn()),
  subscribeToSessionEvents: vi.fn((cb: (event: SessionEvent) => void) => {
    sessionEventSubscribers.add(cb);
    return () => sessionEventSubscribers.delete(cb);
  }),
  triggerResync: mockTriggerResync,
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

vi.mock('../../persistent-session', () => ({
  usePersistentSession: () => mockPersistentSession,
  usePersistentSessionState: () => mockPersistentSession,
  usePersistentSessionActions: () => mockPersistentSession,
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

const mockClimb: Climb = {
  uuid: 'climb-1',
  setter_username: 'setter',
  name: 'Test Climb',
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
        <GraphQLQueueProvider {...defaultProps}>{children}</GraphQLQueueProvider>
      </QueryClientProvider>
    );
  };
}

describe('takeControl optimistic driver claim', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionEventSubscribers.clear();
    mockPersistentSession.driverParticipantId = null;
    mockPersistentSession.participantId = 'participant-1';
    mockTakeControl.mockResolvedValue(undefined);
  });

  it('flips isDriver=true immediately on takeControl(climb) before the DriverChanged event lands', async () => {
    const { result } = renderHook(() => useQueueContext(), { wrapper: createWrapper() });

    // Server reports nobody is driving yet.
    expect(result.current.driverParticipantId).toBeNull();
    expect(result.current.isDriver).toBe(false);

    // Defer the takeControl resolution so we can inspect optimistic state mid-flight.
    let resolveTakeControl: () => void = () => {};
    mockTakeControl.mockImplementationOnce(
      () =>
        new Promise<void>((res) => {
          resolveTakeControl = res;
        }),
    );

    act(() => {
      void result.current.takeControl(mockClimb);
    });

    // Optimistic: driver derivation should already point to us before the
    // server's DriverChanged broadcast has landed.
    expect(result.current.driverParticipantId).toBe('participant-1');
    expect(result.current.isDriver).toBe(true);

    // Let the in-flight mutation resolve so the test cleans up cleanly.
    await act(async () => {
      resolveTakeControl();
      await Promise.resolve();
    });
  });

  it('flips isDriver=true on takeControl(null) (driver-only claim)', () => {
    const { result } = renderHook(() => useQueueContext(), { wrapper: createWrapper() });

    expect(result.current.isDriver).toBe(false);
    act(() => {
      void result.current.takeControl(null);
    });
    expect(result.current.driverParticipantId).toBe('participant-1');
    expect(result.current.isDriver).toBe(true);
  });

  it('clears optimistic claim when DriverChanged confirms us', async () => {
    const { result } = renderHook(() => useQueueContext(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.takeControl(mockClimb);
    });
    expect(result.current.isDriver).toBe(true);

    // Server confirms — switch the upstream driverParticipantId and emit
    // DriverChanged. Optimistic value should clear; derivation now reads the
    // server value (which still resolves to us).
    mockPersistentSession.driverParticipantId = 'participant-1';
    act(() => {
      emitSessionEvent({
        __typename: 'DriverChanged',
        driverParticipantId: 'participant-1',
        previousDriverParticipantId: null,
      });
    });

    expect(result.current.driverParticipantId).toBe('participant-1');
    expect(result.current.isDriver).toBe(true);
    // No race lost — no resync needed.
    expect(mockTriggerResync).not.toHaveBeenCalled();
  });

  it('rolls optimistic claim back when DriverChanged names someone else (lost take-control race)', async () => {
    const { result } = renderHook(() => useQueueContext(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.takeControl(mockClimb);
    });
    expect(result.current.isDriver).toBe(true);

    // The server says participant-2 won the race. Optimistic clears and
    // derivation flips back to "we don't drive".
    mockPersistentSession.driverParticipantId = 'participant-2';
    act(() => {
      emitSessionEvent({
        __typename: 'DriverChanged',
        driverParticipantId: 'participant-2',
        previousDriverParticipantId: 'participant-1',
      });
    });

    await waitFor(() => {
      expect(result.current.driverParticipantId).toBe('participant-2');
      expect(result.current.isDriver).toBe(false);
    });
    // Race lost — wall climb must be resynced to the winner's claim.
    expect(mockTriggerResync).toHaveBeenCalledTimes(1);
  });

  it('rolls optimistic claim back when takeControl mutation transport fails', async () => {
    mockTakeControl.mockRejectedValueOnce(new Error('network'));
    const { result } = renderHook(() => useQueueContext(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.takeControl(mockClimb);
    });

    expect(result.current.isDriver).toBe(false);
    expect(result.current.driverParticipantId).toBeNull();
  });

  it('rolls optimistic claim back when takeControl(null) transport fails', async () => {
    mockTakeControl.mockRejectedValueOnce(new Error('network'));
    const { result } = renderHook(() => useQueueContext(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.takeControl(null);
    });

    expect(result.current.isDriver).toBe(false);
    expect(result.current.driverParticipantId).toBeNull();
  });
});
