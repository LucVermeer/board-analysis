import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { QueueBridgeProvider, QueueBridgeInjector, useQueueBridgeBoardInfo } from '../queue-bridge-context';
import { createPlaylistSuggestionSource } from '../playlist-suggestions';
import {
  QueueContext,
  QueueActionsContext,
  CurrentClimbUuidContext,
  type GraphQLQueueContextType,
  type GraphQLQueueActionsType,
} from '../../graphql-queue/QueueContext';
import type { BoardDetails, Climb, Angle } from '@/app/lib/types';
import type { ClimbQueueItem } from '../types';
import { MockRootQueueProvider, type MockRootQueueSeed } from '@/app/test-utils/mock-persistent-session-queue';

// ---------------------------------------------------------------------------
// Mocks — must be defined before importing the SUT
// ---------------------------------------------------------------------------

let mockUuidCounter = 0;
vi.mock('uuid', () => ({
  v4: vi.fn(() => `test-uuid-${++mockUuidCounter}`),
}));

// W6: the root persistent-session provider owns the single queue reducer, and
// board-context bookkeeping replaced the old per-board local-queue copy. Its
// only remaining mockable side-effect is `setBoardContext` (was
// `setLocalQueueState`/`clearLocalQueue`, both gone).
const mockSetBoardContext = vi.fn();
const mockDeactivateSession = vi.fn();

let mockPersistentSession: Record<string, unknown> = {};

// The queue slices (`queue`/`currentClimbQueueItem`/`playlistSuggestionSource`/
// `pendingCurrentClimbUpdates`) and `dispatch` come from the REAL
// `@boardsesh/queue` reducer owned by `MockRootQueueProvider` (via
// `useMockRootQueueState`), so dispatched actions actually re-render consumers.
// Everything else (session/party/board-context fields) comes from the mutable
// module-level `mockPersistentSession`. See
// `app/test-utils/mock-persistent-session-queue.tsx` for why a plain mock
// object can't stand in for the reducer.
//
// The hook is pulled in through `vi.hoisted` (mock-prefixed so the hoisted
// vi.mock factory may reference it) rather than the top-level import, whose
// binding isn't guaranteed initialised when the factory is registered.
const { mockUseRootQueueState } = await vi.hoisted(async () => {
  const mod = await import('@/app/test-utils/mock-persistent-session-queue');
  return { mockUseRootQueueState: mod.useMockRootQueueState };
});

vi.mock('../../persistent-session', () => ({
  usePersistentSession: () => {
    const rootQueue = mockUseRootQueueState();
    return { ...mockPersistentSession, ...rootQueue.state, dispatch: rootQueue.dispatch };
  },
  usePersistentSessionState: () => {
    const rootQueue = mockUseRootQueueState();
    return { ...mockPersistentSession, ...rootQueue.state };
  },
  usePersistentSessionActions: () => {
    const rootQueue = mockUseRootQueueState();
    return { ...mockPersistentSession, dispatch: rootQueue.dispatch };
  },
}));

let mockPartyProfile: { profile: { id: string } | null; username: string; avatarUrl?: string } = {
  profile: null,
  username: '',
};
vi.mock('../../party-manager/party-profile-context', () => ({
  usePartyProfile: () => mockPartyProfile,
}));

const mockShowMessage = vi.fn();
vi.mock('../../providers/snackbar-provider', () => ({
  useSnackbar: () => ({ showMessage: mockShowMessage }),
}));

// Default: every climb passes. Tests that need to exercise the rejection
// path override this via mockCanAddClimbToBoard.mockReturnValueOnce(...).
type CompatResult = { ok: true } | { ok: false; reason: 'board_name' | 'layout' | 'holds_out_of_range' };
const mockCanAddClimbToBoard = vi.fn<(climb: unknown, target: unknown) => CompatResult>(() => ({ ok: true }));
vi.mock('@/app/lib/board-compatibility', () => ({
  canAddClimbToBoard: (climb: unknown, target: unknown) => mockCanAddClimbToBoard(climb, target),
}));

vi.mock('../../board-lock/queue-add-error-messages', () => ({
  queueAddErrorMessage: () => 'Climb is not compatible with this board',
}));

vi.mock('@/app/lib/live-activity/live-activity-bridge', () => ({
  default: () => null,
}));

vi.mock('../../graphql-queue/QueueContext', () => {
  const React = require('react');
  const ctx = React.createContext(undefined);
  const actionsCtx = React.createContext(undefined);
  const currentClimbCtx = React.createContext(undefined);
  const currentClimbUuidCtx = React.createContext(null);
  const queueListCtx = React.createContext(undefined);
  const searchCtx = React.createContext(undefined);
  const sessionCtx = React.createContext(undefined);
  return {
    QueueContext: ctx,
    QueueActionsContext: actionsCtx,
    CurrentClimbContext: currentClimbCtx,
    CurrentClimbUuidContext: currentClimbUuidCtx,
    QueueListContext: queueListCtx,
    SearchContext: searchCtx,
    SessionContext: sessionCtx,
    useQueueActions: () => React.useContext(actionsCtx),
    __esModule: true,
  };
});

let mockPathname = '/kilter/1/10/1,2/40/list';
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

vi.mock('@/app/lib/url-utils', async () => {
  // Pull the real `extractAngleFromPathname` through — duplicating its
  // implementation drifted from the source when the helper grew negative-
  // angle support. The other url-utils helpers we mock here are heavy
  // SSR-y functions; we just want to keep the parser honest.
  const actual = await vi.importActual<typeof import('@/app/lib/url-utils')>('@/app/lib/url-utils');
  return {
    getBaseBoardPath: (p: string) => p.replace(/\/\d+$/, ''),
    extractAngleFromPathname: actual.extractAngleFromPathname,
    DEFAULT_SEARCH_PARAMS: {
      gradeAccuracy: 0,
      maxGrade: 0,
      minGrade: 0,
      minRating: 0,
      minAscents: 0,
      sortBy: 'ascents',
      sortOrder: 'desc',
      name: '',
      onlyClassics: false,
      onlyTallClimbs: false,
      onlyWideClimbs: false,
    },
  };
});

// Mock playlist board-config helper so cold-start seeding tests don't pull in
// the real board constants data. Returns a simple, deterministic BoardDetails
// shape per board type that the seed helper can stringify into baseBoardPath.
// QueueBridgeProvider mounts `LiveActivityBridge` via `next/dynamic`. That
// component's render path pulls in `useLiveActivity` → `useWsAuthToken` →
// `useSession` (next-auth), which needs a `<SessionProvider>` we don't
// stand up in these tests. The actual Live Activity behaviour is exercised
// separately in `use-live-activity.test.ts` — here we just need the bridge
// tree to mount without crashing on the dynamic import.
vi.mock('@/app/lib/live-activity/live-activity-bridge', () => ({
  default: () => null,
}));

vi.mock('@/app/lib/board-config-for-playlist', () => ({
  getBoardDetailsForPlaylist: (boardType: string, layoutId: number | null | undefined) => {
    if (!layoutId) return null;
    if (boardType === 'moonboard') {
      return {
        board_name: 'moonboard',
        layout_id: layoutId,
        size_id: 0,
        set_ids: [17, 18],
        layout_name: 'MoonBoard 2024',
        size_name: 'Full',
        size_description: 'Full',
        set_names: ['A', 'B'],
      };
    }
    return {
      board_name: boardType,
      layout_id: layoutId,
      size_id: 10,
      set_ids: [1, 2],
      layout_name: 'Original',
      size_name: '12x12',
      size_description: 'Full Size',
      set_names: ['Standard', 'Extended'],
    };
  },
  getDefaultAngleForBoard: () => 40,
}));

// Now import the SUT — after all vi.mock calls

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTestBoardDetails(overrides?: Partial<BoardDetails>): BoardDetails {
  return {
    board_name: 'kilter',
    layout_id: 1,
    size_id: 10,
    set_ids: '1,2',
    images_to_holds: {},
    holdsData: {},
    edge_left: 0,
    edge_right: 100,
    edge_bottom: 0,
    edge_top: 100,
    boardHeight: 100,
    boardWidth: 100,
    layout_name: 'Original',
    size_name: '12x12',
    size_description: 'Full Size',
    set_names: ['Standard', 'Extended'],
    ...overrides,
  } as BoardDetails;
}

function createTestClimb(overrides?: Partial<Climb>): Climb {
  return {
    uuid: 'climb-1',
    setter_username: 'setter1',
    name: 'Test Climb',
    description: 'A test climb',
    frames: 'p1r12p2r13',
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
    ...overrides,
  } as Climb;
}

function createTestQueueItem(climb?: Climb, uuid?: string): ClimbQueueItem {
  return {
    climb: climb ?? createTestClimb(),
    addedBy: null,
    uuid: uuid ?? 'item-uuid-1',
    suggested: false,
  };
}

function createDefaultPersistentSession(overrides?: Record<string, unknown>) {
  return {
    activeSession: null,
    session: null,
    isConnecting: false,
    hasConnected: false,
    error: null,
    clientId: null,
    isLeader: false,
    users: [],
    // Placeholders only — the live `queue`/`currentClimbQueueItem`/
    // `playlistSuggestionSource` come from the MockRootQueueProvider reducer and
    // override these on the merge in the vi.mock factory above. Seed the actual
    // values via the `seed` prop passed to `MockRootQueueProvider`.
    currentClimbQueueItem: null,
    queue: [],
    playlistSuggestionSource: null,
    // Board-context bookkeeping (renamed from localBoardPath/localBoardDetails/
    // isLocalQueueLoaded). `setBoardContext` replaces setLocalQueueState +
    // clearLocalQueue.
    soloBoardPath: null,
    soloBoardDetails: null,
    isBoardContextLoaded: false,
    setBoardContext: mockSetBoardContext,
    deactivateSession: mockDeactivateSession,
    activateSession: vi.fn(),
    setInitialQueueForSession: vi.fn(),
    subscribeToQueueEvents: vi.fn(() => vi.fn()),
    addQueueItem: vi.fn(() => Promise.resolve()),
    removeQueueItem: vi.fn(() => Promise.resolve()),
    setCurrentClimb: vi.fn(() => Promise.resolve()),
    setQueue: vi.fn(() => Promise.resolve()),
    mirrorCurrentClimb: vi.fn(() => Promise.resolve()),
    replaceQueueItem: vi.fn(() => Promise.resolve()),
    reportWallDisconnect: vi.fn(() => Promise.resolve()),
    triggerResync: vi.fn(),
    participantId: null,
    ...overrides,
  };
}

/** Minimal fake GraphQLQueueContextType for injection tests */
function createFakeQueueContext(overrides?: Partial<GraphQLQueueContextType>): GraphQLQueueContextType {
  return {
    queue: [],
    currentClimbQueueItem: null,
    currentClimb: null,
    climbSearchParams: {
      gradeAccuracy: 0,
      maxGrade: 0,
      minGrade: 0,
      minRating: 0,
      minAscents: 0,
      sortBy: 'ascents',
      sortOrder: 'desc',
      name: '',
      onlyClassics: false,
      onlyTallClimbs: false,
      onlyWideClimbs: false,
    },
    climbSearchResults: null,
    suggestedClimbs: [],
    totalSearchResultCount: null,
    hasMoreResults: false,
    isFetchingClimbs: false,
    isFetchingNextPage: false,
    hasDoneFirstFetch: false,
    viewOnlyMode: false,
    parsedParams: { board_name: 'kilter', layout_id: 1, size_id: 10, set_ids: [1, 2], angle: 40 },
    isSessionActive: false,
    sessionId: null,
    startSession: vi.fn(async () => ''),
    joinSession: vi.fn(async () => {}),
    endSession: vi.fn(),
    sessionSummary: null,
    sessionSummaryBoardType: null,
    sessionSummaryHealthKitWorkoutId: null,
    dismissSessionSummary: vi.fn(),
    sessionGoal: null,
    users: [],
    clientId: null,
    isLeader: false,
    isBackendMode: false,
    hasConnected: false,
    connectionError: null,
    disconnect: vi.fn(),
    addToQueue: vi.fn(),
    removeFromQueue: vi.fn(),
    setCurrentClimb: vi.fn(),
    setCurrentClimbQueueItem: vi.fn(),
    setPlaylistSuggestionSource: vi.fn(),
    refreshPlaylistSuggestionSource: vi.fn(),
    replaceQueueItem: vi.fn(),
    setClimbSearchParams: vi.fn(),
    mirrorClimb: vi.fn(),
    fetchMoreClimbs: vi.fn(),
    getNextClimbQueueItem: vi.fn(() => null),
    getPreviousClimbQueueItem: vi.fn(() => null),
    setQueue: vi.fn(),
    ...overrides,
  } as GraphQLQueueContextType;
}

/**
 * Hook to read the QueueContext value exposed by QueueBridgeProvider.
 */
function useTestQueueContext() {
  return React.useContext(QueueContext);
}

/**
 * Hook to read the QueueActionsContext value exposed by QueueBridgeProvider.
 */
function useTestQueueActions() {
  return React.useContext(QueueActionsContext);
}

/**
 * Hook to read data fields exposed by QueueBridgeProvider. The bridge no
 * longer wraps with QueueDataContext (retired in PR #2198 phase 3.6); the
 * combined QueueContext now carries every data field directly, so we read
 * from there.
 */
function useTestQueueData() {
  return React.useContext(QueueContext);
}

/**
 * Hook to read the CurrentClimbUuidContext value exposed by QueueBridgeProvider.
 */
function useTestCurrentClimbUuid() {
  return React.useContext(CurrentClimbUuidContext);
}

/** Extract the actions slice from a combined context (simulates GraphQLQueueProvider's actionsValue) */
function extractActions(ctx: GraphQLQueueContextType): GraphQLQueueActionsType {
  return {
    addToQueue: ctx.addToQueue,
    removeFromQueue: ctx.removeFromQueue,
    setCurrentClimb: ctx.setCurrentClimb,
    previewClimbFromBrowse: ctx.previewClimbFromBrowse,
    setCurrentClimbQueueItem: ctx.setCurrentClimbQueueItem,
    setPlaylistSuggestionSource: ctx.setPlaylistSuggestionSource,
    refreshPlaylistSuggestionSource: ctx.refreshPlaylistSuggestionSource,
    replaceQueueItem: ctx.replaceQueueItem,
    setClimbSearchParams: ctx.setClimbSearchParams,
    setCountSearchParams: ctx.setClimbSearchParams,
    mirrorClimb: ctx.mirrorClimb,
    fetchMoreClimbs: ctx.fetchMoreClimbs,
    getNextClimbQueueItem: ctx.getNextClimbQueueItem,
    getPreviousClimbQueueItem: ctx.getPreviousClimbQueueItem,
    setQueue: ctx.setQueue,
    startSession: ctx.startSession,
    joinSession: ctx.joinSession,
    endSession: ctx.endSession,
    dismissSessionSummary: ctx.dismissSessionSummary,
    disconnect: ctx.disconnect,
    reportWallDisconnect: ctx.reportWallDisconnect,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('queue-bridge-context', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUuidCounter = 0;
    mockPersistentSession = createDefaultPersistentSession();
    mockPartyProfile = { profile: null, username: '' };
    mockCanAddClimbToBoard.mockReturnValue({ ok: true });
  });

  // -----------------------------------------------------------------------
  // QueueBridgeProvider — adapter mode (no injector mounted)
  // -----------------------------------------------------------------------
  describe('QueueBridgeProvider (adapter mode)', () => {
    function renderBridgeHook(seed?: MockRootQueueSeed) {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <MockRootQueueProvider seed={seed}>
          <QueueBridgeProvider>{children}</QueueBridgeProvider>
        </MockRootQueueProvider>
      );
      return renderHook(
        () => ({
          boardInfo: useQueueBridgeBoardInfo(),
          queueCtx: useTestQueueContext(),
        }),
        { wrapper },
      );
    }

    it('provides adapter context when no injector is mounted', () => {
      const { result } = renderBridgeHook();
      // The queue context should be defined (adapter fallback)
      expect(result.current.queueCtx).toBeDefined();
      expect(result.current.queueCtx!.queue).toEqual([]);
    });

    it('hasActiveQueue is false when no board details and empty queue', () => {
      mockPersistentSession = createDefaultPersistentSession();
      const { result } = renderBridgeHook();
      expect(result.current.boardInfo.hasActiveQueue).toBe(false);
    });

    it('hasActiveQueue is true when the root queue has items and board details exist', () => {
      const bd = createTestBoardDetails();
      const item = createTestQueueItem();
      mockPersistentSession = createDefaultPersistentSession({
        soloBoardDetails: bd,
        soloBoardPath: '/kilter/1/10/1,2',
        isBoardContextLoaded: true,
      });
      const { result } = renderBridgeHook({ queue: [item], currentClimbQueueItem: item });
      expect(result.current.boardInfo.hasActiveQueue).toBe(true);
    });

    it('uses active session board details on non-board routes even before queue items load', () => {
      const bd = createTestBoardDetails();
      mockPersistentSession = createDefaultPersistentSession({
        activeSession: {
          sessionId: 'party-1',
          boardPath: '/kilter/1/10/1,2/40/list',
          boardDetails: bd,
          parsedParams: {
            board_name: 'kilter',
            layout_id: 1,
            size_id: 10,
            set_ids: [1, 2],
            angle: 40,
          },
        },
        isBoardContextLoaded: true,
      });

      const { result } = renderBridgeHook({ queue: [], currentClimbQueueItem: null });

      expect(result.current.boardInfo.boardDetails).toEqual(bd);
      expect(result.current.boardInfo.angle).toBe(40);
      expect(result.current.boardInfo.hasActiveQueue).toBe(true);
    });

    it('provides current climb uuid in adapter mode', () => {
      const item = createTestQueueItem(createTestClimb({ uuid: 'c1' }), 'u1');
      mockPersistentSession = createDefaultPersistentSession({
        soloBoardDetails: createTestBoardDetails(),
        soloBoardPath: '/kilter/1/10/1,2',
        isBoardContextLoaded: true,
      });

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <MockRootQueueProvider seed={{ queue: [item], currentClimbQueueItem: item }}>
          <QueueBridgeProvider>{children}</QueueBridgeProvider>
        </MockRootQueueProvider>
      );

      const { result } = renderHook(() => useTestCurrentClimbUuid(), { wrapper });
      expect(result.current).toBe('u1');
    });

    // -------------------------------------------------------------------
    // Adapter queue operations
    // -------------------------------------------------------------------
    describe('adapter queue operations', () => {
      const bd = createTestBoardDetails();
      const climb1 = createTestClimb({ uuid: 'c1', name: 'Climb 1' });
      const climb2 = createTestClimb({ uuid: 'c2', name: 'Climb 2' });
      const climb3 = createTestClimb({ uuid: 'c3', name: 'Climb 3' });

      // Solo helper: seed the real root reducer with the queue/current the test
      // wants, and record which board that root queue belongs to via the
      // board-context fields (no more separate local-queue copy). Assertions
      // read the live result from `result.current` (the bridge context derived
      // straight from root state) rather than the retired setLocalQueueState.
      function renderWithLocalQueue(queue: ClimbQueueItem[], current: ClimbQueueItem | null) {
        mockPersistentSession = createDefaultPersistentSession({
          soloBoardDetails: bd,
          soloBoardPath: '/kilter/1/10/1,2',
          isBoardContextLoaded: true,
        });
        const wrapper = ({ children }: { children: React.ReactNode }) => (
          <MockRootQueueProvider seed={{ queue, currentClimbQueueItem: current }}>
            <QueueBridgeProvider>{children}</QueueBridgeProvider>
          </MockRootQueueProvider>
        );
        return renderHook(() => useTestQueueContext(), { wrapper });
      }

      it('addToQueue creates item and activates it as current', () => {
        const { result } = renderWithLocalQueue([], null);
        act(() => {
          result.current!.addToQueue(climb1);
        });
        expect(result.current!.queue).toHaveLength(1);
        expect(result.current!.queue[0].climb.uuid).toBe('c1');
        // When current is null, the new item becomes current (solo auto-activate).
        expect(result.current!.currentClimbQueueItem?.climb.uuid).toBe('c1');
      });

      it('addToQueue of a duplicate item uuid with no current climb does not spuriously activate a current', () => {
        // Solo no-op guard regression (W6): DELTA_ADD_QUEUE_ITEM is idempotent by
        // the queue-item uuid — a duplicate-uuid add is a reducer no-op (returns
        // the SAME state reference, see insertQueueItemIdempotent). The solo
        // auto-activate follow-up must NOT fire on a no-op add, or a duplicate add
        // fabricates a current climb the user never chose. The mocked uuidv4 mints
        // 'test-uuid-1' for the first build, so seeding the queue with that exact
        // item uuid forces buildItem's fresh uuid to collide with the existing entry.
        const existingItem = createTestQueueItem(createTestClimb({ uuid: 'c-existing' }), 'test-uuid-1');
        const { result } = renderWithLocalQueue([existingItem], null); // no current climb

        act(() => {
          result.current!.addToQueue(createTestClimb({ uuid: 'c-dup' }));
        });

        // The add was a no-op: the queue is unchanged (still the one existing item)...
        expect(result.current!.queue).toHaveLength(1);
        expect(result.current!.queue[0].uuid).toBe('test-uuid-1');
        expect(result.current!.queue[0].climb.uuid).toBe('c-existing');
        // ...and, crucially, no spurious current-climb activation fired.
        expect(result.current!.currentClimbQueueItem).toBeNull();
      });

      it('removeFromQueue filters item and updates state', () => {
        const item1 = createTestQueueItem(climb1, 'u1');
        const item2 = createTestQueueItem(climb2, 'u2');
        const { result } = renderWithLocalQueue([item1, item2], item1);
        act(() => {
          result.current!.removeFromQueue(item1);
        });
        expect(result.current!.queue).toHaveLength(1);
        expect(result.current!.queue[0].uuid).toBe('u2');
        // Current was removed, so solo promotes the new head.
        expect(result.current!.currentClimbQueueItem?.uuid).toBe('u2');
      });

      it('setCurrentClimbQueueItem updates current', () => {
        const item1 = createTestQueueItem(climb1, 'u1');
        const item2 = createTestQueueItem(climb2, 'u2');
        const { result } = renderWithLocalQueue([item1, item2], item1);
        act(() => {
          result.current!.setCurrentClimbQueueItem(item2);
        });
        expect(result.current!.currentClimbQueueItem?.uuid).toBe('u2');
      });

      it('getNextClimbQueueItem returns next item in queue', () => {
        const item1 = createTestQueueItem(climb1, 'u1');
        const item2 = createTestQueueItem(climb2, 'u2');
        const { result } = renderWithLocalQueue([item1, item2], item1);
        const next = result.current!.getNextClimbQueueItem();
        expect(next?.uuid).toBe('u2');
      });

      it('getPreviousClimbQueueItem returns previous item in queue', () => {
        const item1 = createTestQueueItem(climb1, 'u1');
        const item2 = createTestQueueItem(climb2, 'u2');
        const { result } = renderWithLocalQueue([item1, item2], item2);
        const prev = result.current!.getPreviousClimbQueueItem();
        expect(prev?.uuid).toBe('u1');
      });

      it('getNextClimbQueueItem returns null when at end', () => {
        const item1 = createTestQueueItem(climb1, 'u1');
        const { result } = renderWithLocalQueue([item1], item1);
        const next = result.current!.getNextClimbQueueItem();
        expect(next).toBeNull();
      });

      it('getNextClimbQueueItem falls back to playlist suggestions when at end of queue', () => {
        const item1 = createTestQueueItem(climb1, 'u1');
        const source = createPlaylistSuggestionSource({
          playlistUuid: 'playlist-1',
          activatedClimb: climb1,
          climbs: [climb1, climb2],
          boardDetails: bd,
        });
        const { result } = renderWithLocalQueue([item1], item1);

        act(() => {
          result.current!.setPlaylistSuggestionSource(source);
        });

        const next = result.current!.getNextClimbQueueItem();
        expect(next?.climb.uuid).toBe('c2');
        expect(next?.suggested).toBe(true);
        expect(next?.uuid).toBe('playlist-peek:c2');
      });

      it('getPreviousClimbQueueItem returns null when at beginning', () => {
        const item1 = createTestQueueItem(climb1, 'u1');
        const { result } = renderWithLocalQueue([item1], item1);
        const prev = result.current!.getPreviousClimbQueueItem();
        expect(prev).toBeNull();
      });

      it('mirrorClimb toggles mirrored flag', () => {
        const climb = createTestClimb({ uuid: 'c1', mirrored: false });
        const item = createTestQueueItem(climb, 'u1');
        const { result } = renderWithLocalQueue([item], item);
        act(() => {
          result.current!.mirrorClimb();
        });
        expect(result.current!.currentClimbQueueItem?.climb.mirrored).toBe(true);
        expect(result.current!.queue[0].climb.mirrored).toBe(true);
      });

      it('replaceQueueItem updates the current item in place when the replaced uuid is current', () => {
        const item1 = createTestQueueItem(climb1, 'u1');
        const item2 = createTestQueueItem(climb2, 'u2');
        const { result } = renderWithLocalQueue([item1, item2], item1);
        const editedClimb = createTestClimb({ uuid: 'c1-edited', name: 'Edited Climb' });
        act(() => {
          result.current!.replaceQueueItem('u1', editedClimb);
        });
        // Slot uuid preserved, climb swapped, and the current item follows the
        // replacement (it was the replaced entry).
        expect(result.current!.queue.map((queueItem: ClimbQueueItem) => queueItem.uuid)).toEqual(['u1', 'u2']);
        expect(result.current!.queue[0].climb.uuid).toBe('c1-edited');
        expect(result.current!.currentClimbQueueItem?.uuid).toBe('u1');
        expect(result.current!.currentClimbQueueItem?.climb.uuid).toBe('c1-edited');
      });

      it('replaceQueueItem leaves the current item alone when a different uuid is replaced', () => {
        const item1 = createTestQueueItem(climb1, 'u1');
        const item2 = createTestQueueItem(climb2, 'u2');
        const { result } = renderWithLocalQueue([item1, item2], item1);
        const editedClimb = createTestClimb({ uuid: 'c2-edited', name: 'Edited Climb 2' });
        act(() => {
          result.current!.replaceQueueItem('u2', editedClimb);
        });
        expect(result.current!.queue[1].climb.uuid).toBe('c2-edited');
        expect(result.current!.currentClimbQueueItem?.uuid).toBe('u1');
        expect(result.current!.currentClimbQueueItem?.climb.uuid).toBe('c1');
      });

      it('setQueue replaces queue and preserves current if present', () => {
        const item1 = createTestQueueItem(climb1, 'u1');
        const item2 = createTestQueueItem(climb2, 'u2');
        const { result } = renderWithLocalQueue([item1], item1);
        act(() => {
          result.current!.setQueue([item1, item2]);
        });
        expect(result.current!.queue).toHaveLength(2);
        // Current was in the new queue so it's preserved
        expect(result.current!.currentClimbQueueItem?.uuid).toBe('u1');
      });

      it('setQueue resets current to first when old current not in new queue', () => {
        const item1 = createTestQueueItem(climb1, 'u1');
        const item2 = createTestQueueItem(climb2, 'u2');
        const { result } = renderWithLocalQueue([item1], item1);
        act(() => {
          result.current!.setQueue([item2]);
        });
        expect(result.current!.currentClimbQueueItem?.uuid).toBe('u2');
      });

      it('setCurrentClimb inserts after current in queue', () => {
        const item1 = createTestQueueItem(climb1, 'u1');
        const { result } = renderWithLocalQueue([item1], item1);
        act(() => {
          void result.current!.setCurrentClimb(climb2, { playlistSuggestionSource: null });
        });
        // New item was inserted after item1
        expect(result.current!.queue).toHaveLength(2);
        expect(result.current!.queue[0].uuid).toBe('u1');
        expect(result.current!.queue[1].climb.uuid).toBe('c2');
        // New item becomes current
        expect(result.current!.currentClimbQueueItem?.climb.uuid).toBe('c2');
      });

      it('setCurrentClimb with a playlist source prunes future suggested items in local mode', async () => {
        const item1 = createTestQueueItem(climb1, 'u1');
        const staleSuggestedItem = {
          ...createTestQueueItem(createTestClimb({ uuid: 'stale-suggestion' }), 'stale-suggestion-item'),
          suggested: true,
        };
        const manualFutureItem = createTestQueueItem(climb3, 'manual-future-item');
        const source = createPlaylistSuggestionSource({
          playlistUuid: 'playlist-1',
          activatedClimb: climb2,
          climbs: [climb1, climb2, climb3],
          boardDetails: bd,
        });
        const { result } = renderWithLocalQueue([item1, staleSuggestedItem, manualFutureItem], item1);

        await act(async () => {
          await result.current!.setCurrentClimb(climb2, { playlistSuggestionSource: source });
        });

        expect(result.current!.queue.map((item: ClimbQueueItem) => item.climb.uuid)).toEqual(['c1', 'c2', 'c3']);
        expect(result.current!.queue.map((item: ClimbQueueItem) => item.uuid)).toEqual([
          'u1',
          'test-uuid-1',
          'manual-future-item',
        ]);
        expect(result.current!.currentClimbQueueItem?.climb.uuid).toBe('c2');
      });

      it('sets and refreshes playlist suggestion source only when activation identity matches', () => {
        const source = createPlaylistSuggestionSource({
          playlistUuid: 'playlist-1',
          activatedClimb: climb1,
          climbs: [climb1, climb2],
          boardDetails: bd,
        });
        const staleRefresh = createPlaylistSuggestionSource({
          playlistUuid: 'playlist-1',
          activatedClimb: climb2,
          climbs: [climb2, climb3],
          boardDetails: bd,
        });
        const refreshedSource = createPlaylistSuggestionSource({
          playlistUuid: 'playlist-1',
          activatedClimb: climb1,
          climbs: [climb1, climb2, climb3],
          boardDetails: bd,
        });
        const { result } = renderWithLocalQueue([], null);

        act(() => {
          result.current!.setPlaylistSuggestionSource(source);
        });
        expect(result.current!.playlistSuggestionSource).toEqual(source);

        act(() => {
          result.current!.refreshPlaylistSuggestionSource(staleRefresh);
        });
        expect(result.current!.playlistSuggestionSource).toEqual(source);

        act(() => {
          result.current!.refreshPlaylistSuggestionSource(refreshedSource);
        });
        expect(result.current!.playlistSuggestionSource).toEqual(refreshedSource);

        act(() => {
          result.current!.setPlaylistSuggestionSource(null);
        });
        expect(result.current!.playlistSuggestionSource).toBeNull();
      });
    });

    // -------------------------------------------------------------------
    // getNextClimbQueueItem now delegates to the shared @boardsesh/play-view
    // helper (`findNextQueueItemWithSuggestions`) so the bridge's off-board
    // swipe path stays in lockstep with mobile. These cases pin the behaviour
    // the delegation brings, plus the web-only `from` wrapper the bridge keeps
    // around the shared helper.
    // -------------------------------------------------------------------
    describe('getNextClimbQueueItem delegation parity', () => {
      const bd = createTestBoardDetails();
      const climbA = createTestClimb({ uuid: 'a', name: 'Climb A' });
      const climbB = createTestClimb({ uuid: 'b', name: 'Climb B' });
      const climbC = createTestClimb({ uuid: 'c', name: 'Climb C' });

      function renderWithLocalQueue(queue: ClimbQueueItem[], current: ClimbQueueItem | null) {
        mockPersistentSession = createDefaultPersistentSession({
          soloBoardDetails: bd,
          soloBoardPath: '/kilter/1/10/1,2',
          isBoardContextLoaded: true,
        });
        const wrapper = ({ children }: { children: React.ReactNode }) => (
          <MockRootQueueProvider seed={{ queue, currentClimbQueueItem: current }}>
            <QueueBridgeProvider>{children}</QueueBridgeProvider>
          </MockRootQueueProvider>
        );
        return renderHook(() => useTestQueueContext(), { wrapper });
      }

      it('re-walks the playlist from the re-activated climb instead of the first un-queued climb', () => {
        // Behavior intentionally changed by the queue-bridge delegation
        // (lockstep with mobile). The old bridge fell through to
        // getPlaylistSuggestedClimbs(source, queue)[0] — the first source climb
        // not already queued — which here would be `c`. The shared helper
        // re-walks the source from the CURRENT climb (`a`), so re-activating the
        // re-appended `a` at the tail surfaces `b` (a fresh pass), even though
        // `b` is already in the queue. This is the "queue grows 1..n, 1..n"
        // re-walk semantics that mobile relies on.
        const itemA = createTestQueueItem(climbA, 'u-a');
        const itemB = createTestQueueItem(climbB, 'u-b');
        const itemC = createTestQueueItem(climbC, 'u-c');
        // `a'` — climb `a` re-appended at the tail with a distinct queue uuid.
        const itemATail = createTestQueueItem(climbA, 'u-a-tail');
        const source = createPlaylistSuggestionSource({
          playlistUuid: 'playlist-1',
          activatedClimb: climbA,
          climbs: [climbA, climbB, climbC],
          boardDetails: bd,
        });
        const { result } = renderWithLocalQueue([itemA, itemB, itemC, itemATail], itemATail);

        act(() => {
          result.current!.setPlaylistSuggestionSource(source);
        });

        const next = result.current!.getNextClimbQueueItem();
        expect(next?.climb.uuid).toBe('b');
        expect(next?.uuid).toBe('playlist-peek:b');
        expect(next?.suggested).toBe(true);
      });

      it('returns queue[0] when there is no current climb and the queue is non-empty', () => {
        // Behavior intentionally changed by the queue-bridge delegation
        // (lockstep with mobile). The old bridge skipped queue[0] (its anchor
        // lookup found nothing for a null current) and fell straight through to
        // suggestions, returning null with no playlist source. The shared
        // helper short-circuits to queue[0] so a queued-but-never-activated
        // climb still drives the Next button.
        const item1 = createTestQueueItem(climbA, 'i1');
        const item2 = createTestQueueItem(climbB, 'i2');
        const { result } = renderWithLocalQueue([item1, item2], null);

        const next = result.current!.getNextClimbQueueItem();
        expect(next?.uuid).toBe('i1');
        expect(next?.climb.uuid).toBe('a');
      });

      it('seeds the first playlist suggestion when there is no current climb and the queue is empty', () => {
        // Empty-seed parity: matches the helper's getPlaylistSuggestedClimbs
        // anchor on source.activatedClimbUuid. Source [a, b, c] activated on
        // `a` → first suggestion is `b`.
        const source = createPlaylistSuggestionSource({
          playlistUuid: 'playlist-1',
          activatedClimb: climbA,
          climbs: [climbA, climbB, climbC],
          boardDetails: bd,
        });
        const { result } = renderWithLocalQueue([], null);

        act(() => {
          result.current!.setPlaylistSuggestionSource(source);
        });

        const next = result.current!.getNextClimbQueueItem();
        expect(next?.climb.uuid).toBe('b');
        expect(next?.uuid).toBe('playlist-peek:b');
        expect(next?.suggested).toBe(true);
      });

      it('honours the `from` anchor mid-queue and returns queue[idx + 1]', () => {
        const item1 = createTestQueueItem(climbA, 'u1');
        const item2 = createTestQueueItem(climbB, 'u2');
        const item3 = createTestQueueItem(climbC, 'u3');
        // current is item3 (tail) but `from` overrides the anchor to item1.
        const { result } = renderWithLocalQueue([item1, item2, item3], item3);

        const next = result.current!.getNextClimbQueueItem({ from: item1 });
        expect(next?.uuid).toBe('u2');
      });

      it('falls through to the playlist from the `from` climb when that anchor is at the tail', () => {
        const item1 = createTestQueueItem(climbA, 'u1');
        const item2 = createTestQueueItem(climbB, 'u2');
        const source = createPlaylistSuggestionSource({
          playlistUuid: 'playlist-1',
          activatedClimb: climbA,
          climbs: [climbA, climbB, climbC],
          boardDetails: bd,
        });
        // current is null; the `from` anchor (item2, climb `b`, at the tail)
        // drives the re-walk → climb after `b` in the source is `c`.
        const { result } = renderWithLocalQueue([item1, item2], null);

        act(() => {
          result.current!.setPlaylistSuggestionSource(source);
        });

        const next = result.current!.getNextClimbQueueItem({ from: item2 });
        expect(next?.climb.uuid).toBe('c');
        expect(next?.uuid).toBe('playlist-peek:c');
        expect(next?.suggested).toBe(true);
      });

      it('produces a stable playlist-peek uuid across repeated calls in the same state', () => {
        const item1 = createTestQueueItem(climbA, 'u1');
        const source = createPlaylistSuggestionSource({
          playlistUuid: 'playlist-1',
          activatedClimb: climbA,
          climbs: [climbA, climbB],
          boardDetails: bd,
        });
        const { result } = renderWithLocalQueue([item1], item1);

        act(() => {
          result.current!.setPlaylistSuggestionSource(source);
        });

        const first = result.current!.getNextClimbQueueItem();
        const second = result.current!.getNextClimbQueueItem();
        expect(first?.uuid).toBe('playlist-peek:b');
        expect(second?.uuid).toBe(first?.uuid);
      });
    });

    // -------------------------------------------------------------------
    // Cold-start seeding: selecting a climb from a surface with no active
    // board (e.g. a playlist view) must auto-activate the climb's board.
    // -------------------------------------------------------------------
    describe('adapter cold-start seeding', () => {
      function renderWithoutLocalBoard() {
        mockPersistentSession = createDefaultPersistentSession({
          soloBoardDetails: null,
          soloBoardPath: null,
          isBoardContextLoaded: true,
        });
        const wrapper = ({ children }: { children: React.ReactNode }) => (
          <MockRootQueueProvider seed={{ queue: [], currentClimbQueueItem: null }}>
            <QueueBridgeProvider>{children}</QueueBridgeProvider>
          </MockRootQueueProvider>
        );
        return renderHook(() => useTestQueueContext(), { wrapper });
      }

      it('setCurrentClimb seeds board context from a Kilter climb when no board is active', () => {
        const climb = createTestClimb({ uuid: 'c-cold', boardType: 'kilter', layoutId: 1 });
        const { result } = renderWithoutLocalBoard();
        act(() => {
          void result.current!.setCurrentClimb(climb, { playlistSuggestionSource: null });
        });
        // Cold start records the seeded board via setBoardContext (no queue/current
        // args — the queue is root-owned and seeded via the DELTA dispatch below).
        expect(mockSetBoardContext).toHaveBeenCalledTimes(1);
        const [boardPath, boardDetails] = mockSetBoardContext.mock.calls[0];
        expect(boardPath).toBe('/kilter/1/10/1,2');
        expect(boardDetails.board_name).toBe('kilter');
        expect(boardDetails.layout_id).toBe(1);
        // And the climb is activated in the root queue.
        expect(result.current!.queue).toHaveLength(1);
        expect(result.current!.queue[0].climb.uuid).toBe('c-cold');
        expect(result.current!.currentClimbQueueItem?.climb.uuid).toBe('c-cold');
      });

      it('setCurrentClimb seeds with moonboard path shape (no size segment)', () => {
        const climb = createTestClimb({ uuid: 'mb-1', boardType: 'moonboard', layoutId: 99 });
        const { result } = renderWithoutLocalBoard();
        act(() => {
          void result.current!.setCurrentClimb(climb, { playlistSuggestionSource: null });
        });
        expect(mockSetBoardContext).toHaveBeenCalledTimes(1);
        const [boardPath, boardDetails] = mockSetBoardContext.mock.calls[0];
        expect(boardPath).toBe('/moonboard/99/17,18');
        expect(boardDetails.board_name).toBe('moonboard');
      });

      it('addToQueue seeds board context from the climb when no board is active', () => {
        const climb = createTestClimb({ uuid: 'c-add', boardType: 'tension', layoutId: 2 });
        const { result } = renderWithoutLocalBoard();
        act(() => {
          result.current!.addToQueue(climb);
        });
        expect(mockSetBoardContext).toHaveBeenCalledTimes(1);
        const [boardPath] = mockSetBoardContext.mock.calls[0];
        expect(boardPath).toBe('/tension/2/10/1,2');
        expect(result.current!.queue).toHaveLength(1);
        expect(result.current!.queue[0].climb.uuid).toBe('c-add');
        expect(result.current!.currentClimbQueueItem?.climb.uuid).toBe('c-add');
      });

      it('setCurrentClimb is a no-op when the climb has no layoutId to seed from', () => {
        const climb = createTestClimb({ uuid: 'orphan', boardType: 'kilter', layoutId: null });
        const { result } = renderWithoutLocalBoard();
        act(() => {
          void result.current!.setCurrentClimb(climb, { playlistSuggestionSource: null });
        });
        expect(mockSetBoardContext).not.toHaveBeenCalled();
        expect(result.current!.queue).toHaveLength(0);
      });

      it('setCurrentClimb is a no-op when the climb has no boardType to seed from', () => {
        const climb = createTestClimb({ uuid: 'orphan', boardType: undefined, layoutId: 1 });
        const { result } = renderWithoutLocalBoard();
        act(() => {
          void result.current!.setCurrentClimb(climb, { playlistSuggestionSource: null });
        });
        expect(mockSetBoardContext).not.toHaveBeenCalled();
        expect(result.current!.queue).toHaveLength(0);
      });
    });

    // -------------------------------------------------------------------
    // Party-mode operations: with an active party session, the adapter still
    // delegates mutations to the persistent session's WebSocket-backed API.
    //
    // W6 FLAGGED BEHAVIOR CHANGE: off-board party mutations are now OPTIMISTIC.
    // The unified `applyLocal` dispatches straight to the single root reducer
    // for BOTH solo and party, so `result.current!.queue`/`currentClimbQueueItem`
    // update immediately after the action — before the mocked party mutation
    // promise resolves and before any server echo. Pre-W6, `applyLocal` no-opped
    // in party mode and off-board party state only ever reflected the server
    // echo. The `not.toHaveBeenCalled()` assertions on the retired
    // `setLocalQueueState` are gone (nothing to assert absence of); the party
    // mutation-call assertions below are UNCHANGED (those call sites didn't
    // move), and each representative case additionally pins the new optimistic
    // local state.
    // -------------------------------------------------------------------
    describe('adapter party-mode operations', () => {
      const bd = createTestBoardDetails();
      const climb1 = createTestClimb({ uuid: 'c1', name: 'Climb 1' });
      const climb2 = createTestClimb({ uuid: 'c2', name: 'Climb 2' });
      const climb3 = createTestClimb({ uuid: 'c3', name: 'Climb 3' });
      const activeSession = {
        sessionId: 'party-1',
        boardPath: '/kilter/1/10/1,2/40/list',
        boardDetails: bd,
        parsedParams: {
          board_name: 'kilter' as const,
          layout_id: 1,
          size_id: 10,
          set_ids: [1, 2],
          angle: 40 as Angle,
        },
      };

      function renderWithPartySession(
        queue: ClimbQueueItem[],
        current: ClimbQueueItem | null,
        psOverrides?: Record<string, unknown>,
      ) {
        mockPersistentSession = createDefaultPersistentSession({
          activeSession,
          isBoardContextLoaded: true,
          clientId: 'client-abc',
          ...psOverrides,
        });
        const wrapper = ({ children }: { children: React.ReactNode }) => (
          <MockRootQueueProvider seed={{ queue, currentClimbQueueItem: current }}>
            <QueueBridgeProvider>{children}</QueueBridgeProvider>
          </MockRootQueueProvider>
        );
        return renderHook(() => useTestQueueContext(), { wrapper });
      }

      it('setCurrentClimb delegates to ps.addQueueItem and ps.setCurrentClimb in party mode', async () => {
        const item1 = createTestQueueItem(climb1, 'u1');
        const { result } = renderWithPartySession([item1], item1);
        await act(async () => {
          await result.current!.setCurrentClimb(climb2, { playlistSuggestionSource: null });
        });
        expect(mockPersistentSession.addQueueItem).toHaveBeenCalledTimes(1);
        const addCall = (mockPersistentSession.addQueueItem as ReturnType<typeof vi.fn>).mock.calls[0];
        expect(addCall[0].climb.uuid).toBe('c2');
        // Position is currentIndex + 1 = 1 (current at index 0, insert after)
        expect(addCall[1]).toBe(1);
        expect(mockPersistentSession.setCurrentClimb).toHaveBeenCalledTimes(1);
        const setCurrentCall = (mockPersistentSession.setCurrentClimb as ReturnType<typeof vi.fn>).mock.calls[0];
        expect(setCurrentCall[0].climb.uuid).toBe('c2');
        // shouldAddToQueue is false (we already added)
        expect(setCurrentCall[1]).toBe(false);
        // correlationId derived from clientId
        expect(setCurrentCall[2]).toMatch(/^client-abc-/);
        // W6 optimistic: the root queue reflects the insert-after-current
        // immediately, without waiting for the party mutations to resolve.
        expect(result.current!.queue.map((item: ClimbQueueItem) => item.climb.uuid)).toEqual(['c1', 'c2']);
        expect(result.current!.currentClimbQueueItem?.climb.uuid).toBe('c2');
      });

      it('setCurrentClimb with a playlist source replaces the party queue for a new item', async () => {
        const item1 = createTestQueueItem(climb1, 'u1');
        const staleSuggestedItem = {
          ...createTestQueueItem(createTestClimb({ uuid: 'stale-suggestion' }), 'stale-suggestion-item'),
          suggested: true,
        };
        const manualFutureItem = createTestQueueItem(climb3, 'manual-future-item');
        const source = createPlaylistSuggestionSource({
          playlistUuid: 'playlist-1',
          activatedClimb: climb2,
          climbs: [climb1, climb2, climb3],
          boardDetails: bd,
        });
        const { result } = renderWithPartySession([item1, staleSuggestedItem, manualFutureItem], item1);

        await act(async () => {
          await result.current!.setCurrentClimb(climb2, { playlistSuggestionSource: source });
        });

        expect(mockPersistentSession.addQueueItem).not.toHaveBeenCalled();
        expect(mockPersistentSession.setCurrentClimb).not.toHaveBeenCalled();
        expect(mockPersistentSession.setQueue).toHaveBeenCalledTimes(1);
        const [newQueue, newCurrent] = (mockPersistentSession.setQueue as ReturnType<typeof vi.fn>).mock.calls[0];
        expect(newQueue.map((item: ClimbQueueItem) => item.climb.uuid)).toEqual(['c1', 'c2', 'c3']);
        expect(newQueue.map((item: ClimbQueueItem) => item.uuid)).toEqual(['u1', 'test-uuid-1', 'manual-future-item']);
        expect(newCurrent.climb.uuid).toBe('c2');
        // W6 optimistic: for a brand-new item the root reducer's insert-after-
        // current + prune-suggested matches the party setQueue payload exactly.
        expect(result.current!.queue.map((item: ClimbQueueItem) => item.climb.uuid)).toEqual(['c1', 'c2', 'c3']);
        expect(result.current!.queue.map((item: ClimbQueueItem) => item.uuid)).toEqual([
          'u1',
          'test-uuid-1',
          'manual-future-item',
        ]);
        expect(result.current!.currentClimbQueueItem?.climb.uuid).toBe('c2');
      });

      it('setCurrentClimb with a playlist source replaces the party queue for an existing item', async () => {
        const item1 = createTestQueueItem(climb1, 'u1');
        const existingItem = createTestQueueItem(climb2, 'u2');
        const staleSuggestedItem = {
          ...createTestQueueItem(createTestClimb({ uuid: 'stale-suggestion' }), 'stale-suggestion-item'),
          suggested: true,
        };
        const manualFutureItem = createTestQueueItem(climb3, 'manual-future-item');
        const source = createPlaylistSuggestionSource({
          playlistUuid: 'playlist-1',
          activatedClimb: climb2,
          climbs: [climb1, climb2, climb3],
          boardDetails: bd,
        });
        const { result } = renderWithPartySession([item1, existingItem, staleSuggestedItem, manualFutureItem], item1);

        await act(async () => {
          await result.current!.setCurrentClimb(climb2, { playlistSuggestionSource: source });
        });

        expect(mockPersistentSession.addQueueItem).not.toHaveBeenCalled();
        expect(mockPersistentSession.setCurrentClimb).not.toHaveBeenCalled();
        expect(mockPersistentSession.setQueue).toHaveBeenCalledTimes(1);
        const [newQueue, newCurrent] = (mockPersistentSession.setQueue as ReturnType<typeof vi.fn>).mock.calls[0];
        expect(newQueue.map((item: ClimbQueueItem) => item.climb.uuid)).toEqual(['c1', 'c2', 'c3']);
        expect(newQueue.map((item: ClimbQueueItem) => item.uuid)).toEqual(['u1', 'u2', 'manual-future-item']);
        expect(newCurrent.uuid).toBe('u2');
        // The optimistic dispatch reuses the existing u2 (resolved before the
        // dispatch), so the local queue matches the authoritative payload with
        // no phantom duplicate c2, and the reducer prunes the stale suggested
        // item after the new current.
        expect(result.current!.queue.map((item) => item.uuid)).toEqual(['u1', 'u2', 'manual-future-item']);
        expect(result.current!.currentClimbQueueItem?.uuid).toBe('u2');
        // The playlist suggestion source survives the activation: `setQueue`'s
        // own UPDATE_QUEUE echo clears the reducer-owned source, so the action
        // re-sets it after a successful setQueue (`reconcileAfterSetQueue`).
        expect(result.current!.playlistSuggestionSource).toEqual(source);
      });

      it('setCurrentClimb passes undefined position when no current is set', async () => {
        const { result } = renderWithPartySession([], null);
        await act(async () => {
          await result.current!.setCurrentClimb(climb1, { playlistSuggestionSource: null });
        });
        expect(mockPersistentSession.addQueueItem).toHaveBeenCalledTimes(1);
        const addCall = (mockPersistentSession.addQueueItem as ReturnType<typeof vi.fn>).mock.calls[0];
        expect(addCall[1]).toBeUndefined();
      });

      it('setCurrentClimbQueueItem delegates to ps.setCurrentClimb in party mode', () => {
        const item1 = createTestQueueItem(climb1, 'u1');
        const item2 = createTestQueueItem(climb2, 'u2');
        const { result } = renderWithPartySession([item1, item2], item1);
        act(() => {
          result.current!.setCurrentClimbQueueItem(item2);
        });
        expect(mockPersistentSession.setCurrentClimb).toHaveBeenCalledTimes(1);
        const call = (mockPersistentSession.setCurrentClimb as ReturnType<typeof vi.fn>).mock.calls[0];
        expect(call[0].uuid).toBe('u2');
        // shouldAddToQueue uses item.suggested
        expect(call[1]).toBe(false);
        // W6 optimistic: current updates immediately.
        expect(result.current!.currentClimbQueueItem?.uuid).toBe('u2');
      });

      it('setCurrentClimbQueueItem promotes playlist peek items before sending to party mode', () => {
        const item1 = createTestQueueItem(climb1, 'u1');
        const source = createPlaylistSuggestionSource({
          playlistUuid: 'playlist-1',
          activatedClimb: climb1,
          climbs: [climb1, climb2],
          boardDetails: bd,
        });
        const { result } = renderWithPartySession([item1], item1);

        act(() => {
          result.current!.setPlaylistSuggestionSource(source);
        });

        const nextItem = result.current!.getNextClimbQueueItem();
        expect(nextItem?.uuid).toBe('playlist-peek:c2');

        act(() => {
          result.current!.setCurrentClimbQueueItem(nextItem!);
        });

        expect(mockPersistentSession.setCurrentClimb).toHaveBeenCalledTimes(1);
        const call = (mockPersistentSession.setCurrentClimb as ReturnType<typeof vi.fn>).mock.calls[0];
        expect(call[0].uuid).toBe('test-uuid-1');
        expect(call[0].uuid).not.toBe('playlist-peek:c2');
        expect(call[0].climb.uuid).toBe('c2');
        expect(call[0].suggested).toBe(true);
        expect(call[1]).toBe(true);
        // W6 optimistic: the promoted peek (minted a fresh queue uuid) is now
        // the current climb and lives in the queue right away.
        expect(result.current!.currentClimbQueueItem?.uuid).toBe('test-uuid-1');
        expect(result.current!.currentClimbQueueItem?.climb.uuid).toBe('c2');
      });

      it('setCurrentClimb rolls back playlist source when party queue replacement fails', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        try {
          const item1 = createTestQueueItem(climb1, 'u1');
          const previousSource = createPlaylistSuggestionSource({
            playlistUuid: 'playlist-1',
            activatedClimb: climb1,
            climbs: [climb1, climb2],
            boardDetails: bd,
          });
          const nextSource = createPlaylistSuggestionSource({
            playlistUuid: 'playlist-1',
            activatedClimb: climb2,
            climbs: [climb2, climb3],
            boardDetails: bd,
          });
          const { result } = renderWithPartySession([item1], item1, {
            setQueue: vi.fn(() => Promise.reject(new Error('ws queue failed'))),
          });

          act(() => {
            result.current!.setPlaylistSuggestionSource(previousSource);
          });
          expect(result.current!.playlistSuggestionSource).toEqual(previousSource);

          let returnValue: ClimbQueueItem | null | undefined;
          await act(async () => {
            returnValue = await result.current!.setCurrentClimb(climb2, { playlistSuggestionSource: nextSource });
          });

          expect(returnValue).toBeNull();
          expect(result.current!.playlistSuggestionSource).toEqual(previousSource);
          expect(consoleErrorSpy).toHaveBeenCalledWith(
            'Failed to replace queue before setting playlist current:',
            expect.any(Error),
          );
        } finally {
          consoleErrorSpy.mockRestore();
        }
      });

      it('addToQueue delegates to ps.addQueueItem in party mode', () => {
        const { result } = renderWithPartySession([], null);
        act(() => {
          result.current!.addToQueue(climb1);
        });
        expect(mockPersistentSession.addQueueItem).toHaveBeenCalledTimes(1);
        const call = (mockPersistentSession.addQueueItem as ReturnType<typeof vi.fn>).mock.calls[0];
        expect(call[0].climb.uuid).toBe('c1');
        // W6 optimistic: the item lands in the root queue immediately. (In party
        // mode the solo-only auto-activate quirk does NOT fire, so current stays
        // null — the server's CurrentClimbChanged decides the current climb.)
        expect(result.current!.queue).toHaveLength(1);
        expect(result.current!.queue[0].climb.uuid).toBe('c1');
        expect(result.current!.currentClimbQueueItem).toBeNull();
      });

      it('removeFromQueue delegates to ps.removeQueueItem in party mode', () => {
        const item1 = createTestQueueItem(climb1, 'u1');
        const { result } = renderWithPartySession([item1], item1);
        act(() => {
          result.current!.removeFromQueue(item1);
        });
        expect(mockPersistentSession.removeQueueItem).toHaveBeenCalledTimes(1);
        expect((mockPersistentSession.removeQueueItem as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe('u1');
        // W6 optimistic: the item is gone from the root queue immediately.
        expect(result.current!.queue).toHaveLength(0);
      });

      it('setQueue delegates to ps.setQueue in party mode', () => {
        const item1 = createTestQueueItem(climb1, 'u1');
        const item2 = createTestQueueItem(climb2, 'u2');
        const { result } = renderWithPartySession([item1], item1);
        act(() => {
          result.current!.setQueue([item1, item2]);
        });
        expect(mockPersistentSession.setQueue).toHaveBeenCalledTimes(1);
        const call = (mockPersistentSession.setQueue as ReturnType<typeof vi.fn>).mock.calls[0];
        expect(call[0]).toHaveLength(2);
        expect(call[1].uuid).toBe('u1');
        // W6 optimistic: the root queue reflects the new queue immediately.
        expect(result.current!.queue).toHaveLength(2);
        expect(result.current!.currentClimbQueueItem?.uuid).toBe('u1');
      });

      it('mirrorClimb delegates to ps.mirrorCurrentClimb in party mode', () => {
        const climb = createTestClimb({ uuid: 'c1', mirrored: false });
        const item = createTestQueueItem(climb, 'u1');
        const { result } = renderWithPartySession([item], item);
        act(() => {
          result.current!.mirrorClimb();
        });
        expect(mockPersistentSession.mirrorCurrentClimb).toHaveBeenCalledTimes(1);
        expect((mockPersistentSession.mirrorCurrentClimb as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(true);
        // W6 optimistic: the mirror flips locally right away.
        expect(result.current!.currentClimbQueueItem?.climb.mirrored).toBe(true);
      });

      it('replaceQueueItem delegates to ps.replaceQueueItem in party mode', () => {
        const item1 = createTestQueueItem(climb1, 'u1');
        const { result } = renderWithPartySession([item1], item1);
        const newClimb = createTestClimb({ uuid: 'c1-edit', name: 'Edited Climb' });
        act(() => {
          result.current!.replaceQueueItem('u1', newClimb);
        });
        expect(mockPersistentSession.replaceQueueItem).toHaveBeenCalledTimes(1);
        const call = (mockPersistentSession.replaceQueueItem as ReturnType<typeof vi.fn>).mock.calls[0];
        expect(call[0]).toBe('u1');
        // Preserves the slot uuid; updates the climb in place
        expect(call[1].uuid).toBe('u1');
        expect(call[1].climb.uuid).toBe('c1-edit');
        // W6 optimistic: the replacement is visible in the root queue right away.
        expect(result.current!.queue[0].climb.uuid).toBe('c1-edit');
        expect(result.current!.currentClimbQueueItem?.climb.uuid).toBe('c1-edit');
      });

      it('setCurrentClimb reuses existing queue item instead of duplicating', async () => {
        const item1 = createTestQueueItem(climb1, 'u1');
        const { result } = renderWithPartySession([item1], item1);
        await act(async () => {
          // Click the same climb that's already in the queue at u1 — should
          // NOT add a duplicate; should call setCurrentClimb on the existing item.
          await result.current!.setCurrentClimb(climb1, { playlistSuggestionSource: null });
        });
        expect(mockPersistentSession.addQueueItem).not.toHaveBeenCalled();
        expect(mockPersistentSession.setCurrentClimb).toHaveBeenCalledTimes(1);
        const call = (mockPersistentSession.setCurrentClimb as ReturnType<typeof vi.fn>).mock.calls[0];
        expect(call[0].uuid).toBe('u1');
        expect(call[0].climb.uuid).toBe('c1');
        // The optimistic dispatch must reuse the existing item, not insert a
        // fresh-uuid phantom — otherwise the server echo (existing item +
        // correlationId) is suppressed as our own and the phantom is stranded
        // until the hash watchdog resyncs. Queue stays length 1 and current
        // stays on the existing item.
        expect(result.current!.queue).toHaveLength(1);
        expect(result.current!.queue[0].uuid).toBe('u1');
        expect(result.current!.currentClimbQueueItem?.uuid).toBe('u1');
      });

      it('setCurrentClimb populates addedBy and addedByUser from party profile', async () => {
        mockPartyProfile = {
          profile: { id: 'user-42' },
          username: 'climber42',
          avatarUrl: 'https://example.com/a.png',
        };
        const { result } = renderWithPartySession([], null);
        await act(async () => {
          await result.current!.setCurrentClimb(climb1, { playlistSuggestionSource: null });
        });
        const addCall = (mockPersistentSession.addQueueItem as ReturnType<typeof vi.fn>).mock.calls[0];
        const newItem = addCall[0];
        expect(newItem.addedBy).toBe('client-abc');
        expect(newItem.addedByUser).toEqual({
          id: 'user-42',
          username: 'climber42',
          avatarUrl: 'https://example.com/a.png',
        });
      });

      it('addToQueue populates addedBy and addedByUser from party profile', () => {
        mockPartyProfile = {
          profile: { id: 'user-99' },
          username: 'climber99',
          avatarUrl: undefined,
        };
        const { result } = renderWithPartySession([], null);
        act(() => {
          result.current!.addToQueue(climb1);
        });
        const call = (mockPersistentSession.addQueueItem as ReturnType<typeof vi.fn>).mock.calls[0];
        expect(call[0].addedBy).toBe('client-abc');
        expect(call[0].addedByUser).toEqual({
          id: 'user-99',
          username: 'climber99',
          avatarUrl: undefined,
        });
      });

      it('setCurrentClimbQueueItem always re-sends in party mode even when item is already current', () => {
        // A peer might have moved the current climb away while our local
        // optimistic state still shows item as current. Tapping should
        // re-send the mutation so the server reconciles.
        const item1 = createTestQueueItem(climb1, 'u1');
        const { result } = renderWithPartySession([item1], item1);
        act(() => {
          result.current!.setCurrentClimbQueueItem(item1);
        });
        // The mutation is re-sent even though item1 is already current locally
        // (a peer may have moved current away). The optimistic dispatch itself
        // is a no-op — the reducer suppresses a DELTA_UPDATE_CURRENT_CLIMB whose
        // uuid already matches the current climb — so local state is unchanged.
        expect(mockPersistentSession.setCurrentClimb).toHaveBeenCalledTimes(1);
        expect((mockPersistentSession.setCurrentClimb as ReturnType<typeof vi.fn>).mock.calls[0][0].uuid).toBe('u1');
        expect(result.current!.currentClimbQueueItem?.uuid).toBe('u1');
      });

      it('setCurrentClimb returns null and skips setCurrentClimb when ps.addQueueItem rejects', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        try {
          mockPersistentSession = createDefaultPersistentSession({
            activeSession,
            isBoardContextLoaded: true,
            clientId: 'client-abc',
            addQueueItem: vi.fn(() => Promise.reject(new Error('ws send failed'))),
          });
          const wrapper = ({ children }: { children: React.ReactNode }) => (
            <MockRootQueueProvider seed={{ queue: [], currentClimbQueueItem: null }}>
              <QueueBridgeProvider>{children}</QueueBridgeProvider>
            </MockRootQueueProvider>
          );
          const { result } = renderHook(() => useTestQueueContext(), { wrapper });
          let returnValue: ClimbQueueItem | null | undefined;
          await act(async () => {
            returnValue = await result.current!.setCurrentClimb(climb1, { playlistSuggestionSource: null });
          });
          // addQueueItem rejected, so nothing landed on the server. Return
          // null so callers (e.g. navigateToClimb) skip downstream side
          // effects like navigation.
          expect(returnValue).toBeNull();
          expect(consoleErrorSpy).toHaveBeenCalledWith(
            'Failed to add queue item before setting current:',
            expect.any(Error),
          );
          expect(mockPersistentSession.setCurrentClimb).not.toHaveBeenCalled();
        } finally {
          consoleErrorSpy.mockRestore();
        }
      });

      it('keeps the optimistic add locally when the party mutation rejects (board-route parity; resync is the safety net)', async () => {
        // FIX 4 / parity: setCurrentClimb's finishError rolls back only
        // playlistSuggestionSource, NOT the optimistic queue add/current — the
        // exact same semantics as the board-route provider, which has been
        // optimistic since before W6 and also does not roll the queue back on a
        // failed mutation. The 60s hash watchdog resync is the safety net that
        // reconciles a rejected mutation; diverging here would desync the two
        // surfaces. This test pins the current behavior: the item STAYS queued and
        // current, and only the playlist source rolls back.
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        try {
          const previousSource = createPlaylistSuggestionSource({
            playlistUuid: 'playlist-1',
            activatedClimb: climb1,
            climbs: [climb1, climb2],
            boardDetails: bd,
          });
          mockPersistentSession = createDefaultPersistentSession({
            activeSession,
            isBoardContextLoaded: true,
            clientId: 'client-abc',
            addQueueItem: vi.fn(() => Promise.reject(new Error('ws send failed'))),
          });
          const wrapper = ({ children }: { children: React.ReactNode }) => (
            <MockRootQueueProvider
              seed={{ queue: [], currentClimbQueueItem: null, playlistSuggestionSource: previousSource }}
            >
              <QueueBridgeProvider>{children}</QueueBridgeProvider>
            </MockRootQueueProvider>
          );
          const { result } = renderHook(() => useTestQueueContext(), { wrapper });

          let returnValue: ClimbQueueItem | null | undefined;
          await act(async () => {
            // Activate a brand-new climb, clearing the playlist source. The party
            // addQueueItem mutation rejects.
            returnValue = await result.current!.setCurrentClimb(climb2, { playlistSuggestionSource: null });
          });

          // The caller gets null (the bridge skips downstream navigation on a
          // failed activation)...
          expect(returnValue).toBeNull();
          // ...but the optimistic item is NOT rolled back — it stays queued and
          // current, matching board-route optimism; only a resync reconciles it.
          expect(result.current!.queue.map((item: ClimbQueueItem) => item.climb.uuid)).toEqual(['c2']);
          expect(result.current!.currentClimbQueueItem?.climb.uuid).toBe('c2');
          // Only the playlist suggestion source rolls back — restored to its
          // pre-activation value.
          expect(result.current!.playlistSuggestionSource).toEqual(previousSource);
        } finally {
          consoleErrorSpy.mockRestore();
        }
      });

      it('setCurrentClimb returns null when ps.setCurrentClimb rejects after addQueueItem succeeds (partial failure)', async () => {
        // Distinct from the addQueueItem-rejects case: here the item DID
        // land in the shared queue, but activating it failed. The item is
        // orphaned (queued but not current). Returning null lets callers
        // skip navigation since the board never got the update.
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        try {
          mockPersistentSession = createDefaultPersistentSession({
            activeSession,
            isBoardContextLoaded: true,
            clientId: 'client-abc',
            addQueueItem: vi.fn(() => Promise.resolve()),
            setCurrentClimb: vi.fn(() => Promise.reject(new Error('set-current ws send failed'))),
          });
          const wrapper = ({ children }: { children: React.ReactNode }) => (
            <MockRootQueueProvider seed={{ queue: [], currentClimbQueueItem: null }}>
              <QueueBridgeProvider>{children}</QueueBridgeProvider>
            </MockRootQueueProvider>
          );
          const { result } = renderHook(() => useTestQueueContext(), { wrapper });
          let returnValue: ClimbQueueItem | null | undefined;
          await act(async () => {
            returnValue = await result.current!.setCurrentClimb(climb1, { playlistSuggestionSource: null });
          });
          expect(returnValue).toBeNull();
          expect(mockPersistentSession.addQueueItem).toHaveBeenCalledTimes(1);
          expect(mockPersistentSession.setCurrentClimb).toHaveBeenCalledTimes(1);
          expect(consoleErrorSpy).toHaveBeenCalledWith(
            'Failed to set current climb after queue add:',
            expect.any(Error),
          );
        } finally {
          consoleErrorSpy.mockRestore();
        }
      });

      it('setCurrentClimb returns null when reusing an existing queue item and ps.setCurrentClimb rejects', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        try {
          const item1 = createTestQueueItem(climb1, 'u1');
          mockPersistentSession = createDefaultPersistentSession({
            activeSession,
            isBoardContextLoaded: true,
            clientId: 'client-abc',
            setCurrentClimb: vi.fn(() => Promise.reject(new Error('set-current rejected'))),
          });
          const wrapper = ({ children }: { children: React.ReactNode }) => (
            <MockRootQueueProvider seed={{ queue: [item1], currentClimbQueueItem: null }}>
              <QueueBridgeProvider>{children}</QueueBridgeProvider>
            </MockRootQueueProvider>
          );
          const { result } = renderHook(() => useTestQueueContext(), { wrapper });
          let returnValue: ClimbQueueItem | null | undefined;
          await act(async () => {
            // climb1 already exists in the queue as item1, so the dedupe
            // path is taken — setCurrentClimb on the existing item.
            returnValue = await result.current!.setCurrentClimb(climb1, { playlistSuggestionSource: null });
          });
          expect(returnValue).toBeNull();
          expect(mockPersistentSession.addQueueItem).not.toHaveBeenCalled();
          expect(mockPersistentSession.setCurrentClimb).toHaveBeenCalledTimes(1);
        } finally {
          consoleErrorSpy.mockRestore();
        }
      });
    });

    // -------------------------------------------------------------------
    // Validation rejection path: validateClimbForQueue surfaces a snackbar
    // error and short-circuits the mutation.
    // -------------------------------------------------------------------
    describe('validation rejection', () => {
      const bd = createTestBoardDetails();
      const climb1 = createTestClimb({ uuid: 'c1', name: 'Climb 1' });

      function renderWithLocalBoard() {
        mockPersistentSession = createDefaultPersistentSession({
          soloBoardDetails: bd,
          soloBoardPath: '/kilter/1/10/1,2',
          isBoardContextLoaded: true,
        });
        const wrapper = ({ children }: { children: React.ReactNode }) => (
          <MockRootQueueProvider seed={{ queue: [], currentClimbQueueItem: null }}>
            <QueueBridgeProvider>{children}</QueueBridgeProvider>
          </MockRootQueueProvider>
        );
        return renderHook(() => useTestQueueContext(), { wrapper });
      }

      it('addToQueue surfaces a snackbar error and skips mutation when canAddClimbToBoard rejects', () => {
        mockCanAddClimbToBoard.mockReturnValueOnce({ ok: false, reason: 'board_name' });
        const { result } = renderWithLocalBoard();
        act(() => {
          result.current!.addToQueue(climb1);
        });
        expect(mockShowMessage).toHaveBeenCalledWith('Climb is not compatible with this board', 'error');
        // Validation short-circuits before any dispatch, so the root queue is
        // untouched (was: setLocalQueueState not called).
        expect(result.current!.queue).toHaveLength(0);
        expect(result.current!.currentClimbQueueItem).toBeNull();
      });

      it('setCurrentClimb returns null and skips mutation when canAddClimbToBoard rejects', async () => {
        mockCanAddClimbToBoard.mockReturnValueOnce({ ok: false, reason: 'board_name' });
        const { result } = renderWithLocalBoard();
        let returned: unknown;
        await act(async () => {
          returned = await result.current!.setCurrentClimb(climb1, { playlistSuggestionSource: null });
        });
        expect(returned).toBeNull();
        expect(mockShowMessage).toHaveBeenCalledWith('Climb is not compatible with this board', 'error');
        expect(result.current!.queue).toHaveLength(0);
        expect(result.current!.currentClimbQueueItem).toBeNull();
      });
    });

    // -------------------------------------------------------------------
    // Wall-disconnect plumbing — always-live model. The bridge forwards a
    // BLE drop to ps.reportWallDisconnect so every member's wall-confirmed
    // lightbulb clears, and no-ops in solo / mid-reconnect.
    // -------------------------------------------------------------------
    describe('adapter reportWallDisconnect plumbing (party mode)', () => {
      const bd = createTestBoardDetails();
      const activeSession = {
        sessionId: 'party-wall-1',
        boardPath: '/kilter/1/10/1,2/40/list',
        boardDetails: bd,
        parsedParams: {
          board_name: 'kilter' as const,
          layout_id: 1,
          size_id: 10,
          set_ids: [1, 2],
          angle: 40 as Angle,
        },
        participantId: 'participant-self',
      };

      function renderWithSession(psOverrides?: Record<string, unknown>) {
        mockPersistentSession = createDefaultPersistentSession({
          activeSession,
          isBoardContextLoaded: true,
          hasConnected: true,
          clientId: 'client-self-ws',
          participantId: 'participant-self',
          ...psOverrides,
        });
        const wrapper = ({ children }: { children: React.ReactNode }) => (
          <MockRootQueueProvider seed={{ queue: [], currentClimbQueueItem: null }}>
            <QueueBridgeProvider>{children}</QueueBridgeProvider>
          </MockRootQueueProvider>
        );
        return renderHook(() => useTestQueueContext(), { wrapper });
      }

      it('reportWallDisconnect delegates to ps.reportWallDisconnect', async () => {
        const { result } = renderWithSession();
        await act(async () => {
          await result.current!.reportWallDisconnect();
        });
        expect(mockPersistentSession.reportWallDisconnect).toHaveBeenCalledTimes(1);
      });

      it('reportWallDisconnect is a no-op (no ps call) while the WS is reconnecting', async () => {
        const { result } = renderWithSession({ hasConnected: false });
        await act(async () => {
          await result.current!.reportWallDisconnect();
        });
        expect(mockPersistentSession.reportWallDisconnect).not.toHaveBeenCalled();
      });
    });

    it('reportWallDisconnect is a no-op in solo (no active party session)', async () => {
      mockPersistentSession = createDefaultPersistentSession({
        activeSession: null,
        soloBoardDetails: createTestBoardDetails(),
      });
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <MockRootQueueProvider>
          <QueueBridgeProvider>{children}</QueueBridgeProvider>
        </MockRootQueueProvider>
      );
      const { result } = renderHook(() => useTestQueueContext(), { wrapper });
      await act(async () => {
        await result.current!.reportWallDisconnect();
      });
      expect(mockPersistentSession.reportWallDisconnect).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // QueueBridgeInjector
  // -----------------------------------------------------------------------
  describe('QueueBridgeInjector', () => {
    const bd = createTestBoardDetails();
    const angle: Angle = 40;

    /**
     * Renders the injector inside a QueueBridgeProvider with an inner
     * QueueContext.Provider (simulating GraphQLQueueProvider) between
     * the bridge and the injector.
     *
     * The hook reads from the bridge's QueueContext (root level), while
     * the injector reads from the inner QueueContext (board route level).
     */
    function renderInjector(boardRouteCtx: GraphQLQueueContextType | undefined, boardUuid?: string) {
      const actions = boardRouteCtx ? extractActions(boardRouteCtx) : undefined;
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <MockRootQueueProvider>
          <QueueBridgeProvider>
            {/* Hook (children) reads bridge's QueueContext = effectiveContext */}
            {children}
            {/* Inner providers simulate GraphQLQueueProvider on board route */}
            <QueueActionsContext.Provider value={actions}>
              <QueueContext.Provider value={boardRouteCtx}>
                <QueueBridgeInjector boardDetails={bd} angle={angle} boardUuid={boardUuid} />
              </QueueContext.Provider>
            </QueueActionsContext.Provider>
          </QueueBridgeProvider>
        </MockRootQueueProvider>
      );

      return renderHook(
        () => ({
          boardInfo: useQueueBridgeBoardInfo(),
          queueCtx: useTestQueueContext(),
          currentClimbUuid: useTestCurrentClimbUuid(),
        }),
        { wrapper },
      );
    }

    it('injects board details and context on mount', () => {
      const fakeCtx = createFakeQueueContext({ queue: [createTestQueueItem()] });
      const { result } = renderInjector(fakeCtx);

      // Injected: hasActiveQueue should be true because injector is mounted
      expect(result.current.boardInfo.hasActiveQueue).toBe(true);
      expect(result.current.boardInfo.boardDetails).toEqual(bd);
      expect(result.current.boardInfo.angle).toBe(40);
      // No /b/{slug} uuid passed → null (standard board routes don't carry one).
      expect(result.current.boardInfo.boardUuid).toBeNull();
      // The bridge's exposed QueueContext should be the injected one
      expect(result.current.queueCtx).toBe(fakeCtx);
      expect(result.current.currentClimbUuid).toBeNull();
    });

    it('surfaces boardUuid when a /b/{slug} route injects it', () => {
      const fakeCtx = createFakeQueueContext({ queue: [createTestQueueItem()] });
      const { result } = renderInjector(fakeCtx, 'board-uuid-xyz');
      // Flows injector → bridge → boardInfo so the root BluetoothProvider can
      // link a paired serial to the saved board.
      expect(result.current.boardInfo.boardUuid).toBe('board-uuid-xyz');
    });

    it('clears on unmount', () => {
      const fakeCtx = createFakeQueueContext();
      const { result, unmount } = renderInjector(fakeCtx);

      // Before unmount — injected
      expect(result.current.boardInfo.hasActiveQueue).toBe(true);

      unmount();

      // After unmount the provider falls back to adapter — no board details
      // Verify by rendering a fresh provider with no injector
      const wrapper2 = ({ children }: { children: React.ReactNode }) => (
        <MockRootQueueProvider>
          <QueueBridgeProvider>{children}</QueueBridgeProvider>
        </MockRootQueueProvider>
      );
      const { result: result2 } = renderHook(() => useQueueBridgeBoardInfo(), {
        wrapper: wrapper2,
      });
      expect(result2.current.hasActiveQueue).toBe(false);
    });

    it('updates context when queueContext changes', () => {
      const fakeCtx1 = createFakeQueueContext({ queue: [] });
      const item1 = createTestQueueItem(createTestClimb({ uuid: 'c1' }), 'u1');
      const item2 = createTestQueueItem(createTestClimb({ uuid: 'c2' }), 'u2');
      const fakeCtx2 = createFakeQueueContext({
        queue: [item1, item2],
        currentClimbQueueItem: item2,
        currentClimb: item2.climb,
      });

      // Use a mutable variable so we can change the value without remounting
      let boardRouteCtx: GraphQLQueueContextType | undefined = fakeCtx1;

      const wrapper = ({ children }: { children: React.ReactNode }) => {
        const actions = boardRouteCtx ? extractActions(boardRouteCtx) : undefined;
        return (
          <MockRootQueueProvider>
            <QueueBridgeProvider>
              {children}
              <QueueActionsContext.Provider value={actions}>
                <QueueContext.Provider value={boardRouteCtx}>
                  <QueueBridgeInjector boardDetails={bd} angle={angle} />
                </QueueContext.Provider>
              </QueueActionsContext.Provider>
            </QueueBridgeProvider>
          </MockRootQueueProvider>
        );
      };

      const { result, rerender } = renderHook(
        () => ({
          boardInfo: useQueueBridgeBoardInfo(),
          queueCtx: useTestQueueContext(),
          currentClimbUuid: useTestCurrentClimbUuid(),
        }),
        { wrapper },
      );

      expect(result.current.queueCtx).toBe(fakeCtx1);
      expect(result.current.currentClimbUuid).toBeNull();

      // Change the board route context and rerender (same wrapper, so provider state persists)
      boardRouteCtx = fakeCtx2;
      rerender();

      // The injector's useEffect should have called updateContext
      expect(result.current.queueCtx).toBe(fakeCtx2);
      expect(result.current.currentClimbUuid).toBe('u2');
    });

    it('exposes disconnect via useQueueActions when context is injected', () => {
      const mockDisconnect = vi.fn();
      const fakeCtx = createFakeQueueContext({ disconnect: mockDisconnect });
      const actions = extractActions(fakeCtx);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <MockRootQueueProvider>
          <QueueBridgeProvider>
            {children}
            <QueueActionsContext.Provider value={actions}>
              <QueueContext.Provider value={fakeCtx}>
                <QueueBridgeInjector boardDetails={bd} angle={angle} />
              </QueueContext.Provider>
            </QueueActionsContext.Provider>
          </QueueBridgeProvider>
        </MockRootQueueProvider>
      );

      const { result } = renderHook(() => useTestQueueActions(), { wrapper });

      expect(result.current?.disconnect).toBe(mockDisconnect);
    });

    it('handles initially-null queueContext via deferred injection', () => {
      // Use a mutable variable so we can change the value without remounting
      let boardRouteCtx: GraphQLQueueContextType | undefined = undefined;

      const wrapper = ({ children }: { children: React.ReactNode }) => {
        const actions = boardRouteCtx ? extractActions(boardRouteCtx) : undefined;
        return (
          <MockRootQueueProvider>
            <QueueBridgeProvider>
              {children}
              <QueueActionsContext.Provider value={actions}>
                <QueueContext.Provider value={boardRouteCtx}>
                  <QueueBridgeInjector boardDetails={bd} angle={angle} />
                </QueueContext.Provider>
              </QueueActionsContext.Provider>
            </QueueBridgeProvider>
          </MockRootQueueProvider>
        );
      };

      const { result, rerender } = renderHook(
        () => ({
          boardInfo: useQueueBridgeBoardInfo(),
          queueCtx: useTestQueueContext(),
        }),
        { wrapper },
      );

      // No injection yet — falls back to adapter (no local queue = not active)
      expect(result.current.boardInfo.hasActiveQueue).toBe(false);

      // Now provide a context value (simulating GraphQLQueueProvider becoming ready)
      const fakeCtx = createFakeQueueContext({ queue: [createTestQueueItem()] });
      boardRouteCtx = fakeCtx;
      rerender();

      // The useEffect should have fired the deferred injection
      expect(result.current.boardInfo.hasActiveQueue).toBe(true);
      expect(result.current.boardInfo.boardDetails).toEqual(bd);
      expect(result.current.queueCtx).toBe(fakeCtx);
    });

    it('keeps QueueActionsContext stable when only data changes (actions identity unchanged)', () => {
      // Shared stable actions object — simulates GraphQLQueueProvider's latestRef pattern
      const stableActions: GraphQLQueueActionsType = {
        addToQueue: vi.fn(),
        removeFromQueue: vi.fn(),
        setCurrentClimb: vi.fn(),
        previewClimbFromBrowse: vi.fn(),
        setCurrentClimbQueueItem: vi.fn(),
        setPlaylistSuggestionSource: vi.fn(),
        refreshPlaylistSuggestionSource: vi.fn(),
        replaceQueueItem: vi.fn(),
        setClimbSearchParams: vi.fn(),
        setCountSearchParams: vi.fn(),
        mirrorClimb: vi.fn(),
        fetchMoreClimbs: vi.fn(),
        getNextClimbQueueItem: vi.fn(() => null),
        getPreviousClimbQueueItem: vi.fn(() => null),
        setQueue: vi.fn(),
        startSession: vi.fn(async () => ''),
        joinSession: vi.fn(async () => {}),
        endSession: vi.fn(),
        dismissSessionSummary: vi.fn(),
        disconnect: vi.fn(),
        reportWallDisconnect: vi.fn(async () => {}),
      };

      const fakeCtx1 = createFakeQueueContext({ queue: [], ...stableActions });
      const fakeCtx2 = createFakeQueueContext({ queue: [createTestQueueItem()], ...stableActions });

      let currentCtx = fakeCtx1;

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <MockRootQueueProvider>
          <QueueBridgeProvider>
            {children}
            <QueueActionsContext.Provider value={stableActions}>
              <QueueContext.Provider value={currentCtx}>
                <QueueBridgeInjector boardDetails={bd} angle={angle} />
              </QueueContext.Provider>
            </QueueActionsContext.Provider>
          </QueueBridgeProvider>
        </MockRootQueueProvider>
      );

      const { result, rerender } = renderHook(
        () => ({
          actions: useTestQueueActions(),
          data: useTestQueueData(),
        }),
        { wrapper },
      );

      const actionsRef1 = result.current.actions;
      expect(actionsRef1).toBeDefined();

      // Change only data (queue items changed), keep same actions object
      currentCtx = fakeCtx2;
      rerender();

      const actionsRef2 = result.current.actions;
      // The actions context value should be the SAME reference since actions identity didn't change
      expect(actionsRef2).toBe(actionsRef1);

      // But data should have changed
      expect(result.current.data?.queue).toHaveLength(1);
    });

    it('syncs board context to the persistent session on unmount', () => {
      const item = createTestQueueItem();
      const fakeCtx = createFakeQueueContext({
        queue: [item],
        currentClimbQueueItem: item,
      });

      mockSetBoardContext.mockClear();

      const { unmount } = renderInjector(fakeCtx);

      // Unmounting the injector triggers clear(), which records the board
      // context being left via setBoardContext (no queue/current copy-back —
      // the queue is root-owned already). setBoardContext is now also called on
      // mount (proactive board-config-change trigger), so we assert the call
      // shape rather than an exact count.
      unmount();

      expect(mockSetBoardContext).toHaveBeenCalledWith(
        expect.any(String), // baseBoardPath computed from pathname
        bd,
      );
    });

    it('does not run clear/re-sync just because pathname changes before unmount', () => {
      const item = createTestQueueItem();
      const fakeCtx = createFakeQueueContext({
        queue: [item],
        currentClimbQueueItem: item,
      });

      mockPathname = '/kilter/1/10/1,2/40/list';

      const rendered = renderInjector(fakeCtx);

      // inject() records the board context on mount; clear that so we can
      // isolate the pathname-change effect below.
      mockSetBoardContext.mockClear();

      // Simulate pathname changing during navigation transition.
      // Injector should not tear down and re-sync until actual unmount.
      mockPathname = '/sessions';
      rendered.rerender();

      expect(mockSetBoardContext).not.toHaveBeenCalled();

      rendered.unmount();
      expect(mockSetBoardContext).toHaveBeenCalledTimes(1);
    });

    it('records board context on unmount even when a party session is active', () => {
      const item = createTestQueueItem();
      const fakeCtx = createFakeQueueContext({
        queue: [item],
        currentClimbQueueItem: item,
      });

      // Activate party session — setBoardContext no-ops in party mode
      mockPersistentSession = {
        ...createDefaultPersistentSession(),
        activeSession: {
          sessionId: 'party-1',
          boardPath: '/kilter/1/10/1,2/40',
          boardDetails: bd,
          parsedParams: {
            board_name: 'kilter',
            layout_id: 1,
            size_id: 10,
            set_ids: [1, 2],
            angle: 40,
          },
        },
      };

      mockSetBoardContext.mockClear();

      const { unmount } = renderInjector(fakeCtx);
      unmount();

      // setBoardContext guards on activeSession, so the bridge still calls it
      // but the function itself no-ops. We just verify the call was made — the
      // actual guard is in use-queue-storage.ts, not in the bridge.
      expect(mockSetBoardContext).toHaveBeenCalled();

      // Reset for other tests
      mockPersistentSession = createDefaultPersistentSession();
    });
  });
});
