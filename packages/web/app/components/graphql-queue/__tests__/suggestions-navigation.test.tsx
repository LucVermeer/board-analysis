import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Climb } from '@/app/lib/types';
import type { ClimbQueueItem } from '../../queue-control/types';

// --- Mocks must come before importing GraphQLQueueProvider ---

const mockShowMessage = vi.fn();
vi.mock('@/app/components/providers/snackbar-provider', () => ({
  useSnackbar: () => ({ showMessage: mockShowMessage }),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/kilter/1/1/1/40',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

// Mutable suggestedClimbs so each test seeds its own walk.
let mockSuggestedClimbs: Climb[] = [];
let mockClimbSearchResults: Climb[] | null = null;

vi.mock('../../queue-control/hooks/use-queue-data-fetching', () => ({
  useQueueDataFetching: () => ({
    climbSearchResults: mockClimbSearchResults,
    suggestedClimbs: mockSuggestedClimbs,
    totalSearchResultCount: 0,
    hasMoreResults: false,
    isFetchingClimbs: false,
    isFetchingNextPage: false,
    fetchMoreClimbs: vi.fn(),
    climbUuids: [],
  }),
}));

// Non-driver: no party session active so isDriver is true in solo, but the
// suggestionsOnly branch under test fires regardless of driver — the bar/drawer
// call site is the only consumer that distinguishes. Here we just need the
// helper itself to walk suggestions correctly.
const mockPersistentSession = {
  activeSession: null,
  session: null,
  isConnecting: false,
  hasConnected: false,
  error: null,
  clientId: null,
  participantId: null,
  isLeader: false,
  driverParticipantId: null,
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
  takeControl: vi.fn().mockResolvedValue(undefined),
  releaseControl: vi.fn().mockResolvedValue(undefined),
  confirmClimbOnWall: vi.fn().mockResolvedValue(undefined),
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
  getClimbSessionCookie: () => null,
  setClimbSessionCookie: vi.fn(),
  clearClimbSessionCookie: vi.fn(),
}));

vi.mock('@/app/lib/session-history-db', () => ({ saveSessionToHistory: vi.fn() }));

vi.mock('@/app/lib/graphql/client', () => ({
  createGraphQLHttpClient: vi.fn(() => ({ request: vi.fn() })),
}));

vi.mock('../../session-summary/session-summary-dialog', () => ({ default: () => null }));

// Import AFTER mocks are wired
import { GraphQLQueueProvider, useQueueContext } from '../QueueContext';

function makeClimb(uuid: string, name: string): Climb {
  return {
    uuid,
    setter_username: 'setter',
    name,
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
        <GraphQLQueueProvider {...defaultProps}>{children}</GraphQLQueueProvider>
      </QueryClientProvider>
    );
  };
}

describe('getNextClimbQueueItem with suggestionsOnly (non-driver swipe-forward)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSuggestedClimbs = [];
    mockClimbSearchResults = null;
  });

  // Regression: the forward branch used to call
  //   suggestions.find(c => c.uuid !== anchorClimbUuid)
  // which returned suggestions[0] whenever the anchor was suggestions[1]
  // (or any later item — `find` walks from the start). That oscillated the
  // non-driver between suggestions[0] and suggestions[1] on repeated taps.
  // Fix uses findIndex(anchor) + 1 so each tap advances one position.
  it('advances one step per call through ≥3 suggestion items', () => {
    const climb0 = makeClimb('climb-0', 'A');
    const climb1 = makeClimb('climb-1', 'B');
    const climb2 = makeClimb('climb-2', 'C');
    const climb3 = makeClimb('climb-3', 'D');
    mockSuggestedClimbs = [climb0, climb1, climb2, climb3];

    const { result } = renderHook(() => useQueueContext(), { wrapper: createWrapper() });

    // Step 1: anchor is suggestions[0] -> expect suggestions[1]
    const anchor0: ClimbQueueItem = {
      uuid: 'anchor-0',
      climb: climb0,
      suggested: true,
    };
    const step1 = result.current.getNextClimbQueueItem({ from: anchor0, suggestionsOnly: true });
    expect(step1).not.toBeNull();
    expect(step1?.climb.uuid).toBe('climb-1');

    // Step 2: anchor is now suggestions[1] -> expect suggestions[2]
    const anchor1: ClimbQueueItem = {
      uuid: 'anchor-1',
      climb: climb1,
      suggested: true,
    };
    const step2 = result.current.getNextClimbQueueItem({ from: anchor1, suggestionsOnly: true });
    expect(step2).not.toBeNull();
    expect(step2?.climb.uuid).toBe('climb-2');

    // Step 3: anchor is now suggestions[2] -> expect suggestions[3]
    const anchor2: ClimbQueueItem = {
      uuid: 'anchor-2',
      climb: climb2,
      suggested: true,
    };
    const step3 = result.current.getNextClimbQueueItem({ from: anchor2, suggestionsOnly: true });
    expect(step3).not.toBeNull();
    expect(step3?.climb.uuid).toBe('climb-3');

    // Step 4: anchor is the last item -> expect null (end of feed).
    const anchor3: ClimbQueueItem = {
      uuid: 'anchor-3',
      climb: climb3,
      suggested: true,
    };
    const step4 = result.current.getNextClimbQueueItem({ from: anchor3, suggestionsOnly: true });
    expect(step4).toBeNull();
  });

  it('starts at suggestions[0] when the anchor is not in the suggestions feed', () => {
    const climb0 = makeClimb('climb-0', 'A');
    const climb1 = makeClimb('climb-1', 'B');
    mockSuggestedClimbs = [climb0, climb1];

    const { result } = renderHook(() => useQueueContext(), { wrapper: createWrapper() });

    // Anchor is a queue item or wall-climb chosen by the driver — not in the
    // suggestions feed. The forward walk should begin at index 0 rather than
    // skipping it.
    const orphanAnchor: ClimbQueueItem = {
      uuid: 'wall-climb',
      climb: makeClimb('outside-feed', 'Z'),
      suggested: false,
    };
    const next = result.current.getNextClimbQueueItem({ from: orphanAnchor, suggestionsOnly: true });
    expect(next).not.toBeNull();
    expect(next?.climb.uuid).toBe('climb-0');
  });

  it('uses the same idx+1 stepping as the previous-walk (mirrors backward branch)', () => {
    // Regression guard: forward and backward must move opposite directions
    // through the same anchor. Without the fix, advancing then retreating from
    // suggestions[1] would loop between suggestions[0] and suggestions[1].
    const climb0 = makeClimb('climb-0', 'A');
    const climb1 = makeClimb('climb-1', 'B');
    const climb2 = makeClimb('climb-2', 'C');
    mockSuggestedClimbs = [climb0, climb1, climb2];

    const { result } = renderHook(() => useQueueContext(), { wrapper: createWrapper() });

    const anchor1: ClimbQueueItem = {
      uuid: 'anchor-1',
      climb: climb1,
      suggested: true,
    };
    const fwd = result.current.getNextClimbQueueItem({ from: anchor1, suggestionsOnly: true });
    const back = result.current.getPreviousClimbQueueItem({ from: anchor1, suggestionsOnly: true });
    expect(fwd?.climb.uuid).toBe('climb-2');
    expect(back?.climb.uuid).toBe('climb-0');
  });

  it('returns null when suggestedClimbs is empty', () => {
    mockSuggestedClimbs = [];

    const { result } = renderHook(() => useQueueContext(), { wrapper: createWrapper() });

    const anchor: ClimbQueueItem = {
      uuid: 'any',
      climb: makeClimb('any-climb', 'X'),
      suggested: true,
    };
    expect(result.current.getNextClimbQueueItem({ from: anchor, suggestionsOnly: true })).toBeNull();
  });

  it('does not oscillate when called with the same anchor repeatedly', () => {
    // The old bug: with anchor = suggestions[1], `find(c => c.uuid !== anchor)`
    // returns suggestions[0] every time, so non-driver swipe-forward would
    // bounce back to the top instead of advancing. This regression guard fires
    // the call repeatedly with the same anchor and asserts the result is
    // suggestions[anchorIdx + 1], not suggestions[0].
    const climb0 = makeClimb('climb-0', 'A');
    const climb1 = makeClimb('climb-1', 'B');
    const climb2 = makeClimb('climb-2', 'C');
    mockSuggestedClimbs = [climb0, climb1, climb2];

    const { result } = renderHook(() => useQueueContext(), { wrapper: createWrapper() });

    const anchor1: ClimbQueueItem = {
      uuid: 'anchor-1',
      climb: climb1,
      suggested: true,
    };
    for (let i = 0; i < 3; i++) {
      const next = result.current.getNextClimbQueueItem({ from: anchor1, suggestionsOnly: true });
      expect(next?.climb.uuid).toBe('climb-2');
    }
  });
});

describe('getNextClimbQueueItem main-branch climbSearchResults walk', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSuggestedClimbs = [];
    mockClimbSearchResults = null;
  });

  it('advances to results[anchorIdx + 1] when the anchor sits mid-list', () => {
    const climbs = [
      makeClimb('search-0', 'A'),
      makeClimb('search-1', 'B'),
      makeClimb('search-2', 'C'),
      makeClimb('search-3', 'D'),
      makeClimb('search-4', 'E'),
    ];
    mockClimbSearchResults = climbs;
    mockSuggestedClimbs = climbs;

    const { result } = renderHook(() => useQueueContext(), { wrapper: createWrapper() });

    const anchorAtIdx2: ClimbQueueItem = {
      uuid: 'anchor-queue-item',
      climb: climbs[2],
      suggested: false,
    };
    const next = result.current.getNextClimbQueueItem({ from: anchorAtIdx2 });
    expect(next).not.toBeNull();
    expect(next?.climb.uuid).toBe('search-3');
    expect(next?.suggested).toBe(true);
  });

  it('does not oscillate to results[0] on repeated calls with the same anchor', () => {
    const climbs = [makeClimb('search-0', 'A'), makeClimb('search-1', 'B'), makeClimb('search-2', 'C')];
    mockClimbSearchResults = climbs;
    mockSuggestedClimbs = climbs;

    const { result } = renderHook(() => useQueueContext(), { wrapper: createWrapper() });

    const anchorAtIdx1: ClimbQueueItem = {
      uuid: 'anchor-queue-item',
      climb: climbs[1],
      suggested: false,
    };
    for (let i = 0; i < 3; i++) {
      const next = result.current.getNextClimbQueueItem({ from: anchorAtIdx1 });
      expect(next?.climb.uuid).toBe('search-2');
    }
  });

  it('returns null when the anchor is the last item in climbSearchResults', () => {
    const climbs = [makeClimb('search-0', 'A'), makeClimb('search-1', 'B')];
    mockClimbSearchResults = climbs;
    mockSuggestedClimbs = climbs;

    const { result } = renderHook(() => useQueueContext(), { wrapper: createWrapper() });

    const anchorAtEnd: ClimbQueueItem = {
      uuid: 'anchor-queue-item',
      climb: climbs[1],
      suggested: false,
    };
    expect(result.current.getNextClimbQueueItem({ from: anchorAtEnd })).toBeNull();
  });

  it('returns null when the anchor is not in climbSearchResults (playlist case)', () => {
    const searchList = [makeClimb('search-0', 'A'), makeClimb('search-1', 'B')];
    mockClimbSearchResults = searchList;
    mockSuggestedClimbs = searchList;

    const { result } = renderHook(() => useQueueContext(), { wrapper: createWrapper() });

    const playlistAnchor: ClimbQueueItem = {
      uuid: 'anchor-playlist-item',
      climb: makeClimb('playlist-only', 'P'),
      suggested: false,
    };
    expect(result.current.getNextClimbQueueItem({ from: playlistAnchor })).toBeNull();
  });

  it('skips search results that are already in the queue', () => {
    const climbs = [
      makeClimb('search-0', 'A'),
      makeClimb('search-1', 'B'),
      makeClimb('search-2', 'C'),
      makeClimb('search-3', 'D'),
    ];
    mockClimbSearchResults = climbs;
    mockSuggestedClimbs = climbs;

    const { result } = renderHook(() => useQueueContext(), { wrapper: createWrapper() });

    // Seed the queue via setCurrentClimbQueueItem with suggested: true so the
    // reducer's DELTA_UPDATE_CURRENT_CLIMB path adds it to state.queue.
    const queuedItem: ClimbQueueItem = {
      uuid: 'queued-search-1',
      climb: climbs[1],
      suggested: true,
    };
    act(() => {
      result.current.setCurrentClimbQueueItem(queuedItem);
    });

    const anchorAtIdx0: ClimbQueueItem = {
      uuid: 'anchor-queue-item',
      climb: climbs[0],
      suggested: false,
    };
    const next = result.current.getNextClimbQueueItem({ from: anchorAtIdx0 });
    expect(next?.climb.uuid).toBe('search-2');
  });

  it('returns null when climbSearchResults is null or empty', () => {
    mockClimbSearchResults = null;
    const { result } = renderHook(() => useQueueContext(), { wrapper: createWrapper() });

    const anchor: ClimbQueueItem = {
      uuid: 'anchor-queue-item',
      climb: makeClimb('any', 'X'),
      suggested: false,
    };
    expect(result.current.getNextClimbQueueItem({ from: anchor })).toBeNull();

    mockClimbSearchResults = [];
    const { result: result2 } = renderHook(() => useQueueContext(), { wrapper: createWrapper() });
    expect(result2.current.getNextClimbQueueItem({ from: anchor })).toBeNull();
  });
});

describe('getPreviousClimbQueueItem main-branch climbSearchResults walk', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSuggestedClimbs = [];
    mockClimbSearchResults = null;
  });

  it('walks back to results[anchorIdx - 1] when the anchor sits mid-list', () => {
    const climbs = [
      makeClimb('search-0', 'A'),
      makeClimb('search-1', 'B'),
      makeClimb('search-2', 'C'),
      makeClimb('search-3', 'D'),
    ];
    mockClimbSearchResults = climbs;
    mockSuggestedClimbs = climbs;

    const { result } = renderHook(() => useQueueContext(), { wrapper: createWrapper() });

    const anchorAtIdx2: ClimbQueueItem = {
      uuid: 'anchor-queue-item',
      climb: climbs[2],
      suggested: false,
    };
    const prev = result.current.getPreviousClimbQueueItem({ from: anchorAtIdx2 });
    expect(prev).not.toBeNull();
    expect(prev?.climb.uuid).toBe('search-1');
    expect(prev?.suggested).toBe(true);
  });

  it('returns null when the anchor is the first item in climbSearchResults', () => {
    const climbs = [makeClimb('search-0', 'A'), makeClimb('search-1', 'B')];
    mockClimbSearchResults = climbs;
    mockSuggestedClimbs = climbs;

    const { result } = renderHook(() => useQueueContext(), { wrapper: createWrapper() });

    const anchorAtStart: ClimbQueueItem = {
      uuid: 'anchor-queue-item',
      climb: climbs[0],
      suggested: false,
    };
    expect(result.current.getPreviousClimbQueueItem({ from: anchorAtStart })).toBeNull();
  });

  it('returns null when the anchor is not in climbSearchResults (playlist case)', () => {
    const searchList = [makeClimb('search-0', 'A'), makeClimb('search-1', 'B')];
    mockClimbSearchResults = searchList;
    mockSuggestedClimbs = searchList;

    const { result } = renderHook(() => useQueueContext(), { wrapper: createWrapper() });

    const playlistAnchor: ClimbQueueItem = {
      uuid: 'anchor-playlist-item',
      climb: makeClimb('playlist-only', 'P'),
      suggested: false,
    };
    expect(result.current.getPreviousClimbQueueItem({ from: playlistAnchor })).toBeNull();
  });
});
