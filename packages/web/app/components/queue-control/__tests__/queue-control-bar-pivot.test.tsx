import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { tFromCatalog } from '@/app/__test-helpers__/i18n-mock';
import {
  PLAY_DRAWER_EVENT,
  readPlayDrawerEventDetail,
  type PlayDrawerEventDetail,
} from '@/app/components/queue-control/play-drawer-event';
import QueueControlBar from '../queue-control-bar';

// -- All mocks before imports --

vi.mock('react-i18next', () => ({
  useTranslation: (ns?: string | readonly string[]) => ({
    i18n: { language: 'en-US' },
    t: (key: string, options?: Record<string, unknown>) => tFromCatalog(ns, key, options),
  }),
}));

const mockShowMessage = vi.fn();
vi.mock('@/app/components/providers/snackbar-provider', () => ({
  useSnackbar: () => ({ showMessage: mockShowMessage }),
}));

const mockGetPreference = vi.fn().mockResolvedValue(null);
const mockSetPreference = vi.fn().mockResolvedValue(undefined);
vi.mock('@/app/lib/user-preferences-db', () => ({
  getPreference: (...args: unknown[]) => mockGetPreference(...args),
  setPreference: (...args: unknown[]) => mockSetPreference(...args),
}));

let mockQueueContext: Record<string, unknown> = {};
vi.mock('@/app/components/graphql-queue', () => ({
  useQueueContext: () => mockQueueContext,
  useQueueActions: () => mockQueueContext,
  useCurrentClimb: () => ({
    currentClimb: mockQueueContext.currentClimb,
  }),
  useQueueList: () => ({
    queue: mockQueueContext.queue,
    suggestedClimbs: [],
  }),
  useSessionData: () => ({
    viewOnlyMode: mockQueueContext.viewOnlyMode ?? false,
    isSessionActive: !!mockQueueContext.sessionId,
    sessionId: mockQueueContext.sessionId ?? null,
    sessionSummary: null,
    sessionGoal: null,
    connectionState: mockQueueContext.connectionState ?? 'idle',
    canMutate: mockQueueContext.canMutate ?? true,
    isDisconnected: mockQueueContext.isDisconnected ?? false,
    users: mockQueueContext.users ?? [],
    clientId: mockQueueContext.clientId ?? null,
    participantId: mockQueueContext.participantId ?? null,
    isLeader: true,
    isBackendMode: false,
    hasConnected: true,
    connectionError: null,
    isPersistentSessionActive: mockQueueContext.isPersistentSessionActive ?? false,
    wallConfirmed: mockQueueContext.wallConfirmed ?? false,
  }),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/kilter/1/1/1/40',
  useParams: () => ({
    board_name: 'kilter',
    layout_id: '1',
    size_id: '1',
    set_ids: '1',
    angle: '40',
  }),
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock('next/link', () => ({
  default: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) =>
    React.createElement('a', props, children),
}));

vi.mock('@/app/lib/analytics', () => ({ track: vi.fn() }));

vi.mock('@/app/hooks/use-card-swipe-navigation', () => ({
  useCardSwipeNavigation: () => ({
    swipeHandlers: {},
    swipeOffset: 0,
    isAnimating: false,
    navigateToNext: vi.fn(),
    navigateToPrev: vi.fn(),
    peekIsNext: true,
    exitOffset: 0,
    enterDirection: null,
    clearEnterAnimation: vi.fn(),
  }),
  EXIT_DURATION: 300,
  SNAP_BACK_DURATION: 200,
  ENTER_ANIMATION_DURATION: 300,
}));

vi.mock('@/app/hooks/use-color-mode', () => ({
  useColorMode: () => ({ mode: 'light' }),
}));

vi.mock('@/app/lib/grade-colors', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    getGradeTintColor: () => null,
  };
});

vi.mock('@/app/components/climb-card/climb-thumbnail', () => ({
  default: () => React.createElement('div', { 'data-testid': 'climb-thumbnail' }),
}));

vi.mock('@/app/components/climb-card/climb-title', () => ({
  default: () => React.createElement('div', { 'data-testid': 'climb-title' }),
}));

vi.mock('@/app/components/queue-control/queue-list', () => ({
  default: React.forwardRef(() => React.createElement('div', { 'data-testid': 'queue-list' })),
}));

vi.mock('@/app/components/swipeable-drawer/swipeable-drawer', () => ({
  default: ({ open, children }: { open?: boolean; children?: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'queue-drawer', 'data-open': open ? 'true' : 'false' }, children),
}));

// queue-control-bar now uses the single `queue-nav-button` for both prev and
// next (next-climb-button.tsx / previous-climb-button.tsx were removed during
// the queue pivot). Mock the new module with a no-op so unit tests don't have
// to satisfy its hooks.
vi.mock('@/app/components/queue-control/queue-nav-button', () => ({
  default: ({ direction }: { direction: 'next' | 'previous' }) =>
    React.createElement('button', { 'data-testid': `${direction}-climb` }),
}));

vi.mock('@/app/components/logbook/tick-button', () => ({
  TickButton: (props: { onActivateTickBar?: () => void; tickBarActive?: boolean }) =>
    React.createElement('button', {
      'data-testid': 'tick-button',
      onClick: props.onActivateTickBar,
      'data-tick-active': props.tickBarActive,
    }),
}));

vi.mock('@/app/components/play-view/play-view-drawer', () => ({
  default: () => null,
}));

vi.mock('@/app/components/onboarding/onboarding-tour-events', () => ({
  TOUR_CLOSE_PLAY_VIEW_EVENT: 'onboarding:close-play-view',
}));

vi.mock('@/app/components/ui/confirm-popover', () => ({
  ConfirmPopover: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
}));

vi.mock('next-auth/react', () => ({
  useSession: () => ({ status: 'unauthenticated', data: null }),
}));

let mockPersistentSessionState: Record<string, unknown> = {
  activeSession: null,
  localBoardDetails: null,
  localCurrentClimbQueueItem: null,
  session: null,
  users: [],
};
vi.mock('@/app/components/persistent-session/persistent-session-context', () => ({
  usePersistentSessionState: () => mockPersistentSessionState,
}));

vi.mock('@/app/components/board-bluetooth-control/bluetooth-context', () => ({
  useBluetoothContext: () => ({
    isConnected: false,
    isConnecting: false,
    connect: vi.fn(),
    disconnect: vi.fn(),
    sendLedUpdate: vi.fn(),
  }),
}));

vi.mock('@/app/components/board-provider/board-provider-context', () => ({
  useBoardProvider: () => ({ logbook: [] }),
}));

vi.mock('@/app/components/logbook/quick-tick-bar', () => ({
  QuickTickBar: React.forwardRef((_props: unknown, _ref: unknown) =>
    React.createElement('div', { 'data-testid': 'quick-tick-bar' }),
  ),
}));

vi.mock('@/app/hooks/use-tick-save', () => ({
  hasPriorHistoryForClimb: () => false,
}));

vi.mock('@/app/components/session-creation/start-sesh-drawer', () => ({
  default: () => null,
}));

vi.mock('@/app/components/sesh-settings/sesh-settings-drawer-event', () => ({
  dispatchOpenSeshSettingsDrawer: vi.fn(),
}));

vi.mock('@/app/lib/session-utils', () => ({
  generateSessionName: () => 'Test Session',
}));

vi.mock('qrcode.react', () => ({
  QRCodeSVG: () => null,
}));

vi.mock('@/app/lib/share-utils', () => ({
  shareWithFallback: vi.fn(),
}));

// Spy on the session cookie clear so the leave-path assertion can check it.
const mockClearClimbSessionCookie = vi.fn();
vi.mock('@/app/lib/climb-session-cookie', () => ({
  clearClimbSessionCookie: () => mockClearClimbSessionCookie(),
  getClimbSessionCookie: vi.fn(() => null),
  setClimbSessionCookie: vi.fn(),
}));

// jsdom doesn't provide window.matchMedia — stub it before the component
// accesses it (the swipe-hint effect calls matchMedia on mount).
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Import after mocks

const mockClimb = {
  uuid: 'climb-1',
  setter_username: 'setter1',
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

const makeQueueItem = (uuid: string) => ({
  uuid,
  climb: { ...mockClimb, uuid: `climb-${uuid}` },
  addedBy: 'user-1',
  suggested: false,
});

const baseQueueContext = {
  queue: [makeQueueItem('item-1')],
  currentClimbQueueItem: makeQueueItem('item-1'),
  currentClimb: mockClimb,
  climbSearchResults: [],
  suggestedClimbs: [],
  isFetchingClimbs: false,
  isFetchingNextPage: false,
  hasDoneFirstFetch: true,
  viewOnlyMode: false,
  parsedParams: { board_name: 'kilter', layout_id: '1', size_id: '1', set_ids: ['1'], angle: '40' },
  connectionState: 'connected',
  sessionId: 'session-1',
  canMutate: true,
  isDisconnected: false,
  users: [],
  endSession: vi.fn(),
  disconnect: vi.fn(),
  addToQueue: vi.fn(),
  removeFromQueue: vi.fn(),
  setCurrentClimb: vi.fn(),
  setCurrentClimbQueueItem: vi.fn(),
  setClimbSearchParams: vi.fn(),
  setCountSearchParams: vi.fn(),
  mirrorClimb: vi.fn(),
  fetchMoreClimbs: vi.fn(),
  getNextClimbQueueItem: vi.fn().mockReturnValue(null),
  getPreviousClimbQueueItem: vi.fn().mockReturnValue(null),
  setQueue: vi.fn(),
  isPersistentSessionActive: false,
};

const defaultProps = {
  angle: '40' as unknown as number,
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

// Build a party session state with N participants. The driver is the
// participant with id === driverId (when provided). users[*] order is the
// declared order in the array; the bar's driver-first partition should float
// the driver to position 0 if it isn't already.
//
// Each participant defaults to a unique `userId` derived from `id` so the
// bar's dedupe (`user.userId ?? user.id`) doesn't collapse the roster to a
// single avatar.
const makeSessionState = (users: { id: string; username: string; userId?: string }[]): Record<string, unknown> => ({
  activeSession: {
    sessionId: 'session-1',
    sessionName: 'Test Session',
    startedAt: new Date('2025-01-01').toISOString(),
  },
  localBoardDetails: null,
  localCurrentClimbQueueItem: null,
  session: { id: 'session-1', name: 'Test Session', startedAt: new Date('2025-01-01').toISOString() },
  users: users.map((u) => ({
    id: u.id,
    username: u.username,
    isLeader: false,
    userId: u.userId ?? `user-${u.id}`,
    connectionState: 'CONNECTED',
  })),
});

describe('QueueControlBar pivot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQueueContext = { ...baseQueueContext };
    mockPersistentSessionState = {
      activeSession: null,
      localBoardDetails: null,
      localCurrentClimbQueueItem: null,
      session: null,
      users: [],
    };
    mockGetPreference.mockResolvedValue(null);
    mockSetPreference.mockResolvedValue(undefined);
  });

  // --- Play-drawer dispatch from the bar -----------------------------------
  // Wall-view mode is gone: the bar now dispatches with no payload + no flags
  // for both thumbnail and title taps. The drawer always opens in browse mode
  // on the wall climb (via the `effectiveItem` fallback). Identity of the
  // wall climb lives on the bar's ON WALL chip, not inside the drawer.

  it('tapping the climb-title region dispatches the play-drawer event with no wallView flag', async () => {
    const seenDetails: PlayDrawerEventDetail[] = [];
    const handler = (event: Event) => {
      const detail = readPlayDrawerEventDetail(event);
      if (detail) seenDetails.push(detail);
    };
    window.addEventListener(PLAY_DRAWER_EVENT, handler);

    try {
      await act(async () => {
        render(<QueueControlBar {...defaultProps} />);
      });

      const title = document.getElementById('onboarding-queue-toggle');
      expect(title).toBeTruthy();

      await act(async () => {
        fireEvent.click(title!);
      });

      expect(seenDetails.length).toBeGreaterThan(0);
      const last = seenDetails[seenDetails.length - 1];
      expect((last as PlayDrawerEventDetail & { wallView?: unknown }).wallView).toBeUndefined();
      // No climb payload on the bar's body-tap path — the drawer falls back
      // to the wall climb via `effectiveItem`.
      expect(last.climb).toBeUndefined();
    } finally {
      window.removeEventListener(PLAY_DRAWER_EVENT, handler);
    }
  });

  it('keyboard Enter on the climb-title region dispatches the play-drawer event with no wallView flag', async () => {
    const seenDetails: PlayDrawerEventDetail[] = [];
    const handler = (event: Event) => {
      const detail = readPlayDrawerEventDetail(event);
      if (detail) seenDetails.push(detail);
    };
    window.addEventListener(PLAY_DRAWER_EVENT, handler);

    try {
      await act(async () => {
        render(<QueueControlBar {...defaultProps} />);
      });

      const title = document.getElementById('onboarding-queue-toggle');
      expect(title).toBeTruthy();

      await act(async () => {
        fireEvent.keyDown(title!, { key: 'Enter' });
      });

      expect(seenDetails.length).toBeGreaterThan(0);
      const last = seenDetails[seenDetails.length - 1];
      expect((last as PlayDrawerEventDetail & { wallView?: unknown }).wallView).toBeUndefined();
    } finally {
      window.removeEventListener(PLAY_DRAWER_EVENT, handler);
    }
  });

  // --- Accessibility on climb-title CTA (P1-C) -----------------------------

  it('climb-title region has role="button" and an accessible aria-label', async () => {
    await act(async () => {
      render(<QueueControlBar {...defaultProps} />);
    });

    const title = document.getElementById('onboarding-queue-toggle');
    expect(title).toBeTruthy();
    expect(title!.getAttribute('role')).toBe('button');
    expect(title!.getAttribute('tabindex')).toBe('0');
    expect(title!.getAttribute('aria-label')).toBe('Open the wall climb');
  });

  // --- Always-live roster (no driver UI) -----------------------------------

  it('renders participants in source order with no driver badge', async () => {
    // Always-live model: no driver role, so no reordering and no "is driving"
    // aria-label anywhere in the bar (mini AvatarGroup or expanded roster).
    mockQueueContext = {
      ...baseQueueContext,
      isPersistentSessionActive: true,
    };
    mockPersistentSessionState = makeSessionState([
      { id: 'p-alice', username: 'alice' },
      { id: 'p-bob', username: 'bob' },
      { id: 'p-carol', username: 'carol' },
    ]);

    const { container } = await act(async () => {
      return render(<QueueControlBar {...defaultProps} />);
    });

    const items = container.querySelectorAll('[class*="participantItem"]');
    expect(items.length).toBe(3);
    const orderedUsernames = Array.from(items).map((el) => el.textContent?.trim());
    expect(orderedUsernames).toEqual(['alice', 'bob', 'carol']);
    expect(screen.queryByLabelText(/is driving/)).toBeNull();
  });
});

// The bar's "Leave session" button (reached by cancelling a failed reconnect)
// used to end the session for the whole crew. It now branches on the roster:
// leave when peers remain, end only when the caller is the last participant.
//
// `SessionUser.id` is the PARTICIPANT id — the DB user UUID for an authenticated
// user, the connection id for an anonymous one (backend room-manager). Self is
// therefore identified by `participantId` (== the local user's own SessionUser.id),
// NOT by the connection-only `clientId`. A roster row's stable key is `userId ?? id`.
describe('QueueControlBar leave session branch', () => {
  const makeRosterUser = (
    id: string,
    options: { userId?: string | null; connectionState?: 'CONNECTED' | 'RECONNECTING' } = {},
  ) => ({
    id,
    username: id,
    isLeader: false,
    userId: options.userId ?? null,
    connectionState: options.connectionState ?? 'CONNECTED',
  });

  // Drive the bar into the reconnect-cancel confirm row and click "Leave
  // session". `clientId` is a connection id; `participantId` is the local user's
  // participant id (== their own SessionUser.id). Returns the end/leave spies.
  const leaveFromBar = (options: {
    users: ReturnType<typeof makeRosterUser>[];
    clientId: string | null;
    participantId?: string | null;
  }): { endSession: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> } => {
    const endSession = vi.fn();
    const disconnect = vi.fn();
    mockQueueContext = {
      ...baseQueueContext,
      sessionId: 'session-1',
      connectionState: 'reconnecting',
      isDisconnected: false,
      clientId: options.clientId,
      participantId: options.participantId ?? null,
      endSession,
      disconnect,
    };
    mockPersistentSessionState = {
      activeSession: { sessionId: 'session-1', sessionName: 'Test Session' },
      session: { id: 'session-1', name: 'Test Session' },
      users: options.users,
    };
    render(<QueueControlBar {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByLabelText('Leave session'));
    return { endSession, disconnect };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockQueueContext = { ...baseQueueContext };
    mockPersistentSessionState = { activeSession: null, session: null, users: [] };
    mockGetPreference.mockResolvedValue(null);
    mockSetPreference.mockResolvedValue(undefined);
  });

  it('ends the session (summary) when an anonymous user is the sole participant', () => {
    // Anon: SessionUser.id === connection id === participantId; no userId.
    const { endSession, disconnect } = leaveFromBar({
      users: [makeRosterUser('conn-me')],
      clientId: 'conn-me',
      participantId: 'conn-me',
    });
    expect(endSession).toHaveBeenCalledTimes(1);
    expect(disconnect).not.toHaveBeenCalled();
  });

  it('ends the session (summary) when an AUTHENTICATED user is the sole participant', () => {
    // Authed: SessionUser.id === participantId === user UUID, distinct from the
    // connection id carried in clientId. Self-identification must use
    // participantId — comparing against clientId would misread the user's own
    // row as a peer and silently LEAVE with no recap (the HIGH bug).
    const { endSession, disconnect } = leaveFromBar({
      users: [makeRosterUser('user-uuid', { userId: 'user-uuid' })],
      clientId: 'conn-abc',
      participantId: 'user-uuid',
    });
    expect(endSession).toHaveBeenCalledTimes(1);
    expect(disconnect).not.toHaveBeenCalled();
  });

  it('ends the session for an authenticated user on two tabs (same participant id)', () => {
    // Two connections of one authed user share the same participant id. Every
    // roster row carries the caller's own userId, so the "any other participant?"
    // check finds none → caller is the last participant → end. (This asserts the
    // last-participant decision, not roster dedup: the check would still find no
    // "other" even without dedup, since both rows equal `myUserId`.)
    const { endSession, disconnect } = leaveFromBar({
      users: [
        makeRosterUser('user-uuid', { userId: 'user-uuid' }),
        makeRosterUser('user-uuid', { userId: 'user-uuid' }),
      ],
      clientId: 'conn-tab-2',
      participantId: 'user-uuid',
    });
    expect(endSession).toHaveBeenCalledTimes(1);
    expect(disconnect).not.toHaveBeenCalled();
  });

  it('leaves (no summary) when other participants remain, and clears the session cookie', () => {
    const { endSession, disconnect } = leaveFromBar({
      users: [
        makeRosterUser('user-uuid', { userId: 'user-uuid' }),
        makeRosterUser('friend-uuid', { userId: 'friend-uuid' }),
      ],
      clientId: 'conn-abc',
      participantId: 'user-uuid',
    });
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(endSession).not.toHaveBeenCalled();
    // The leave path clears the cookie so a board-route remount doesn't
    // re-activate the session this participant just left.
    expect(mockClearClimbSessionCookie).toHaveBeenCalledTimes(1);
  });

  it('counts a RECONNECTING peer as present, so it leaves instead of ending', () => {
    const { endSession, disconnect } = leaveFromBar({
      users: [
        makeRosterUser('user-uuid', { userId: 'user-uuid' }),
        makeRosterUser('friend-uuid', { userId: 'friend-uuid', connectionState: 'RECONNECTING' }),
      ],
      clientId: 'conn-abc',
      participantId: 'user-uuid',
    });
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(endSession).not.toHaveBeenCalled();
  });

  it('ends the session when only the caller remains, even if the participant id is unknown', () => {
    // Mid-reconnect: neither participantId nor clientId known → fall back to
    // roster size — a single entry is the caller, so end.
    const { endSession, disconnect } = leaveFromBar({
      users: [makeRosterUser('conn-me')],
      clientId: null,
      participantId: null,
    });
    expect(endSession).toHaveBeenCalledTimes(1);
    expect(disconnect).not.toHaveBeenCalled();
  });
});
