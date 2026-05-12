import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';
import { tFromCatalog } from '@/app/__test-helpers__/i18n-mock';
import StartSeshDrawer from '../start-sesh-drawer';

vi.mock('react-i18next', () => ({
  useTranslation: (ns?: string) => ({
    t: (key: string, options?: Record<string, unknown>) => tFromCatalog(ns, key, options),
    i18n: { language: 'en-US' },
  }),
  Trans: ({ children }: { children?: React.ReactNode }) => children ?? null,
}));

// --- Mocks ---

const mockSetInitialQueueForSession = vi.fn();
const mockActivateSession = vi.fn();
let mockLocalQueue: unknown[] = [];
let mockLocalCurrentClimbQueueItem: unknown = null;
let mockLocalBoardPath: string | null = null;
let mockLocalBoardDetails: {
  board_name: string;
  layout_id: number;
  size_id: number;
  set_ids: number[];
  angle?: number;
} | null = null;

vi.mock('@/app/components/persistent-session/persistent-session-context', () => ({
  usePersistentSession: () => ({
    activateSession: mockActivateSession,
    setInitialQueueForSession: mockSetInitialQueueForSession,
    localQueue: mockLocalQueue,
    localCurrentClimbQueueItem: mockLocalCurrentClimbQueueItem,
    localBoardPath: mockLocalBoardPath,
    localBoardDetails: mockLocalBoardDetails,
  }),
  usePersistentSessionState: () => ({
    localQueue: mockLocalQueue,
    localCurrentClimbQueueItem: mockLocalCurrentClimbQueueItem,
    localBoardPath: mockLocalBoardPath,
  }),
  usePersistentSessionActions: () => ({
    activateSession: mockActivateSession,
    setInitialQueueForSession: mockSetInitialQueueForSession,
  }),
}));

const mockCreateSession = vi.fn();
vi.mock('@/app/hooks/use-create-session', () => ({
  useCreateSession: () => ({
    createSession: mockCreateSession,
    isCreating: false,
  }),
}));

const mockRouterPush = vi.fn();
let mockPathname: string | null = null;
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
  usePathname: () => mockPathname,
}));

vi.mock('next-auth/react', () => ({
  useSession: () => ({ status: 'authenticated' }),
}));

vi.mock('@/app/components/providers/snackbar-provider', () => ({
  useSnackbar: () => ({ showMessage: vi.fn() }),
}));

vi.mock('@/app/components/providers/auth-modal-provider', () => ({
  useAuthModal: () => ({ openAuthModal: vi.fn() }),
}));

vi.mock('@/app/lib/climb-session-cookie', () => ({
  setClimbSessionCookie: vi.fn(),
}));

vi.mock('@/app/hooks/use-my-boards', () => ({
  useMyBoards: () => ({
    boards: [
      {
        uuid: 'board-1',
        slug: 'kilter-original-12x12',
        name: 'Kilter',
        angle: 40,
        boardType: 'kilter',
        layoutId: 1,
        sizeId: 10,
        setIds: '1,2',
      },
      {
        uuid: 'board-2',
        slug: 'tension-board-8x10',
        name: 'Tension',
        angle: 30,
        boardType: 'tension',
        layoutId: 2,
        sizeId: 20,
        setIds: '3,4',
      },
    ],
    isLoading: false,
    error: null,
  }),
}));

vi.mock('@/app/hooks/use-drawer-drag-resize', () => ({
  useDrawerDragResize: () => ({
    paperRef: { current: null },
    dragHandlers: {},
  }),
}));

vi.mock('@/app/components/swipeable-drawer/swipeable-drawer', () => ({
  default: ({
    children,
    open,
    footer,
    placement,
    paperRef,
  }: {
    children: React.ReactNode;
    open: boolean;
    footer?: React.ReactNode;
    placement?: string;
    paperRef?: React.Ref<HTMLDivElement>;
  }) =>
    open ? (
      <div data-testid="drawer" data-placement={placement} ref={typeof paperRef === 'function' ? undefined : paperRef}>
        {children}
        {footer}
      </div>
    ) : null,
}));

vi.mock('@/app/components/board-scroll/board-discovery-scroll', () => ({
  default: ({
    onBoardClick,
    myBoards,
    selectedBoardUuid,
  }: {
    onBoardClick: (board: { uuid: string; name: string }) => void;
    myBoards?: Array<{
      uuid: string;
      name: string;
      slug: string;
      angle: number;
      boardType: string;
      layoutId: number;
      sizeId: number;
      setIds: string;
    }>;
    selectedBoardUuid?: string;
  }) => (
    <div data-testid="board-discovery-scroll">
      {myBoards?.map((board) => (
        <button
          key={board.uuid}
          data-testid={`board-card-${board.name}`}
          data-selected={selectedBoardUuid === board.uuid ? 'true' : 'false'}
          onClick={() => onBoardClick(board)}
        >
          {board.name}
        </button>
      ))}
    </div>
  ),
}));

vi.mock('@/app/components/board-scroll/board-thumbnail', () => ({
  default: () => <div data-testid="board-thumbnail" />,
  useBoardDetails: () => null,
}));

vi.mock('@/app/components/board-selector-drawer/board-selector-drawer', () => ({
  default: () => null,
}));

let mockBridgeBoardDetails: {
  board_name: string;
  layout_id: number;
  size_id: number;
  set_ids: number[];
  angle?: number;
} | null = null;
let mockBridgeAngle = 0;
let mockBridgeQueue: unknown[] = [];
let mockBridgeCurrentClimbQueueItem: unknown = null;

vi.mock('@/app/components/queue-control/queue-bridge-context', () => ({
  useQueueBridgeBoardInfo: () => ({
    boardDetails: mockBridgeBoardDetails,
    angle: mockBridgeAngle,
    hasActiveQueue: false,
    isHydrated: false,
  }),
}));

vi.mock('@/app/components/graphql-queue', () => ({
  useQueueList: () => ({
    queue: mockBridgeQueue,
    suggestedClimbs: [],
  }),
  useCurrentClimb: () => ({
    currentClimbQueueItem: mockBridgeCurrentClimbQueueItem,
    currentClimb: null,
  }),
}));

// --- Helpers ---

function makeQueueItem(uuid: string, climbName: string) {
  return {
    uuid,
    climb: { uuid: `climb-${uuid}`, name: climbName, frames: '', mirrored: false, angle: 40 },
    addedBy: null,
    suggested: false,
  };
}

// --- Tests ---

describe('StartSeshDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLocalQueue = [];
    mockLocalCurrentClimbQueueItem = null;
    mockLocalBoardPath = null;
    mockLocalBoardDetails = null;
    mockBridgeBoardDetails = null;
    mockBridgeAngle = 0;
    mockBridgeQueue = [];
    mockBridgeCurrentClimbQueueItem = null;
    mockPathname = null;
    mockCreateSession.mockResolvedValue('new-session-id');
  });

  async function expandBoardSelectorAndSelect(boardName: string) {
    // If the board selector is collapsed (card shown), expand it first
    const selectedCard = screen.queryByTestId('selected-board-card');
    if (selectedCard) {
      fireEvent.click(selectedCard);
    }

    const boardCard = screen.getByTestId(`board-card-${boardName}`);
    fireEvent.click(boardCard);
  }

  async function submitSesh() {
    const submitButton = screen.getByRole('button', { name: /sesh/i });
    await act(async () => {
      fireEvent.click(submitButton);
    });
  }

  async function selectBoardAndSubmit(boardName: string) {
    await expandBoardSelectorAndSelect(boardName);
    await submitSesh();
  }

  it('auto-selects board from localBoardPath and starts session without manual selection', async () => {
    const item1 = makeQueueItem('q1', 'Boulder 1');
    mockLocalQueue = [item1];
    mockLocalCurrentClimbQueueItem = item1;
    mockLocalBoardPath = '/b/kilter-original-12x12/40/list';

    render(<StartSeshDrawer open onClose={vi.fn()} />);

    // Board should be auto-selected — just press submit
    await submitSesh();

    await waitFor(() => {
      expect(mockCreateSession).toHaveBeenCalled();
    });

    expect(mockSetInitialQueueForSession).toHaveBeenCalledWith('new-session-id', [item1], item1, undefined);
    expect(mockRouterPush).toHaveBeenCalled();
  });

  it('auto-selects a custom config on generic routes (from persistent session)', async () => {
    mockLocalBoardPath = '/kilter/original/12x12/screw_bolt/40/list';
    mockLocalBoardDetails = { board_name: 'kilter', layout_id: 1, size_id: 10, set_ids: [1, 2] };

    render(<StartSeshDrawer open onClose={vi.fn()} />);

    // Generic route → custom config auto-selected; submit uses the
    // generic path, not a /b/{slug} attribution to any named UserBoard.
    await submitSesh();

    await waitFor(() => {
      expect(mockCreateSession).toHaveBeenCalledWith(
        expect.anything(),
        '/kilter/original/12x12/screw_bolt/40/list',
      );
    });
    expect(mockRouterPush).toHaveBeenCalled();
  });

  it('prefers bridgeBoardDetails over localBoardDetails on the current generic route', async () => {
    // User is currently on a kilter route (bridge populated). The persistent
    // session still holds a stale tension route — bridge should win.
    mockPathname = '/kilter/original/12x12/screw_bolt/40/list';
    mockBridgeBoardDetails = { board_name: 'kilter', layout_id: 1, size_id: 10, set_ids: [1, 2] };
    mockBridgeAngle = 40;
    mockLocalBoardPath = '/tension/some-layout/8x10/main/30/list';
    mockLocalBoardDetails = { board_name: 'tension', layout_id: 99, size_id: 99, set_ids: [99, 99] };

    render(<StartSeshDrawer open onClose={vi.fn()} />);
    await submitSesh();

    await waitFor(() => {
      expect(mockCreateSession).toHaveBeenCalled();
    });
    // boardPath should reflect the CURRENT (bridge) route, not the stale
    // localBoardPath — i.e. auto-select picked the bridge-side custom config.
    expect(mockCreateSession).toHaveBeenCalledWith(
      expect.anything(),
      '/kilter/original/12x12/screw_bolt/40/list',
    );
  });

  it('shows collapsed card when board is auto-selected', async () => {
    mockLocalBoardPath = '/b/kilter-original-12x12/40/list';

    render(<StartSeshDrawer open onClose={vi.fn()} />);

    // Should show the selected board card with edit overlay
    expect(screen.getByTestId('selected-board-card')).toBeTruthy();

    // Board discovery scroll should not be visible (collapsed)
    expect(screen.queryByTestId('board-discovery-scroll')).toBeNull();
  });

  it('expands board selector when selected card is clicked', async () => {
    mockLocalBoardPath = '/b/kilter-original-12x12/40/list';

    render(<StartSeshDrawer open onClose={vi.fn()} />);

    // Click selected card to expand
    fireEvent.click(screen.getByTestId('selected-board-card'));

    // Board discovery scroll should now be visible
    expect(screen.getByTestId('board-discovery-scroll')).toBeTruthy();
  });

  it('transfers local queue when board matches', async () => {
    const item1 = makeQueueItem('q1', 'Boulder 1');
    const item2 = makeQueueItem('q2', 'Boulder 2');
    mockLocalQueue = [item1, item2];
    mockLocalCurrentClimbQueueItem = item1;
    mockLocalBoardPath = '/b/kilter-original-12x12';

    render(<StartSeshDrawer open onClose={vi.fn()} />);

    // Board is auto-selected, just submit
    await submitSesh();

    await waitFor(() => {
      expect(mockSetInitialQueueForSession).toHaveBeenCalledWith('new-session-id', [item1, item2], item1, undefined);
    });

    expect(mockRouterPush).toHaveBeenCalled();
  });

  it('does not transfer queue when board does not match', async () => {
    const item1 = makeQueueItem('q1', 'Boulder 1');
    mockLocalQueue = [item1];
    mockLocalCurrentClimbQueueItem = item1;
    mockLocalBoardPath = '/b/tension-board-8x10';

    render(<StartSeshDrawer open onClose={vi.fn()} />);

    // Tension is auto-selected, expand and select Kilter instead
    await selectBoardAndSubmit('Kilter');

    await waitFor(() => {
      expect(mockCreateSession).toHaveBeenCalled();
    });

    expect(mockSetInitialQueueForSession).not.toHaveBeenCalled();
    expect(mockRouterPush).toHaveBeenCalled();
  });

  it('does not transfer queue when local queue is empty', async () => {
    mockLocalQueue = [];
    mockLocalCurrentClimbQueueItem = null;
    mockLocalBoardPath = '/b/kilter-original-12x12';

    render(<StartSeshDrawer open onClose={vi.fn()} />);

    await submitSesh();

    await waitFor(() => {
      expect(mockCreateSession).toHaveBeenCalled();
    });

    expect(mockSetInitialQueueForSession).not.toHaveBeenCalled();
  });

  it('does not transfer queue when localBoardPath is null', async () => {
    const item1 = makeQueueItem('q1', 'Boulder 1');
    mockLocalQueue = [item1];
    mockLocalCurrentClimbQueueItem = item1;
    mockLocalBoardPath = null;

    render(<StartSeshDrawer open onClose={vi.fn()} />);

    // No auto-selection, manually select a board
    await selectBoardAndSubmit('Kilter');

    await waitFor(() => {
      expect(mockCreateSession).toHaveBeenCalled();
    });

    expect(mockSetInitialQueueForSession).not.toHaveBeenCalled();
  });

  it('transfers queue when only currentClimbQueueItem exists (no queue items)', async () => {
    const item1 = makeQueueItem('q1', 'Boulder 1');
    mockLocalQueue = [];
    mockLocalCurrentClimbQueueItem = item1;
    mockLocalBoardPath = '/b/kilter-original-12x12';

    render(<StartSeshDrawer open onClose={vi.fn()} />);

    // Board is auto-selected, just submit
    await submitSesh();

    await waitFor(() => {
      expect(mockSetInitialQueueForSession).toHaveBeenCalledWith('new-session-id', [], item1, undefined);
    });
  });

  it('shows full board scroll when no board context is available', async () => {
    mockLocalBoardPath = null;
    mockLocalBoardDetails = null;

    render(<StartSeshDrawer open onClose={vi.fn()} />);

    // No auto-selection, full discovery scroll should show
    expect(screen.getByTestId('board-discovery-scroll')).toBeTruthy();
    expect(screen.queryByText('Change')).toBeNull();
  });

  it('does not attribute a generic route to a same-config named UserBoard', async () => {
    // localBoardDetails has the exact numeric identity of the "Kilter" mock
    // UserBoard (layoutId 1, sizeId 10, setIds "1,2"). Pre-fix logic would
    // match by IDs and auto-select Kilter — that's the attribution bug.
    // Post-fix: generic route stays on a custom config, NOT /b/kilter-...
    mockLocalBoardPath = '/kilter/original/12x12/screw_bolt/40/list';
    mockLocalBoardDetails = { board_name: 'kilter', layout_id: 1, size_id: 10, set_ids: [1, 2] };

    render(<StartSeshDrawer open onClose={vi.fn()} />);
    await submitSesh();

    await waitFor(() => {
      expect(mockCreateSession).toHaveBeenCalled();
    });
    expect(mockCreateSession).not.toHaveBeenCalledWith(expect.anything(), expect.stringMatching(/^\/b\//));
  });

  it('prioritizes slug match over board details match', async () => {
    // localBoardPath matches Kilter by slug, but localBoardDetails matches Tension by IDs
    mockLocalBoardPath = '/b/kilter-original-12x12/40/list';
    mockLocalBoardDetails = { board_name: 'tension', layout_id: 2, size_id: 20, set_ids: [3, 4] };

    render(<StartSeshDrawer open onClose={vi.fn()} />);

    // Should show Kilter (slug match wins), not Tension — selected card visible
    expect(screen.getByTestId('selected-board-card')).toBeTruthy();

    await submitSesh();

    await waitFor(() => {
      expect(mockCreateSession).toHaveBeenCalledWith(expect.anything(), '/b/kilter-original-12x12');
    });
  });

  it('calls activateSession directly when already on the same board route', async () => {
    mockLocalBoardPath = '/b/kilter-original-12x12/40/list';
    mockLocalBoardDetails = { board_name: 'kilter', layout_id: 1, size_id: 10, set_ids: [1, 2] };

    render(<StartSeshDrawer open onClose={vi.fn()} />);

    // Board is auto-selected (Kilter), just submit
    await submitSesh();

    await waitFor(() => {
      expect(mockActivateSession).toHaveBeenCalledWith({
        sessionId: 'new-session-id',
        sessionName: undefined,
        boardPath: '/b/kilter-original-12x12',
        boardDetails: mockLocalBoardDetails,
        parsedParams: {
          board_name: 'kilter',
          layout_id: 1,
          size_id: 10,
          set_ids: [1, 2],
          angle: 40,
        },
        namedBoardName: 'Kilter',
        namedBoardUuid: 'board-1',
      });
    });
  });

  it('does not call activateSession when navigating to a different board', async () => {
    mockLocalBoardPath = '/b/tension-board-8x10/30/list';
    mockLocalBoardDetails = { board_name: 'tension', layout_id: 2, size_id: 20, set_ids: [3, 4] };

    render(<StartSeshDrawer open onClose={vi.fn()} />);

    // Tension is auto-selected, expand and select Kilter instead
    await selectBoardAndSubmit('Kilter');

    await waitFor(() => {
      expect(mockCreateSession).toHaveBeenCalled();
    });

    expect(mockActivateSession).not.toHaveBeenCalled();
  });

  it('does not call activateSession when local and bridge state are both null', async () => {
    mockLocalBoardPath = null;
    mockLocalBoardDetails = null;
    mockBridgeBoardDetails = null;

    render(<StartSeshDrawer open onClose={vi.fn()} />);

    await selectBoardAndSubmit('Kilter');

    await waitFor(() => {
      expect(mockCreateSession).toHaveBeenCalled();
    });

    expect(mockActivateSession).not.toHaveBeenCalled();
  });

  it('activates session via bridge fallback when local state is null (board route injector active)', async () => {
    // This is the core bug scenario: user is on a board route, the bridge injector
    // is active so localBoardPath/localBoardDetails are null, but the bridge context
    // has valid board details and queue data.
    mockLocalBoardPath = null;
    mockLocalBoardDetails = null;
    mockPathname = '/b/kilter-original-12x12/40/list';
    mockBridgeBoardDetails = { board_name: 'kilter', layout_id: 1, size_id: 10, set_ids: [1, 2] };
    mockBridgeAngle = 40;

    const bridgeItem = makeQueueItem('bq1', 'Bridge Climb');
    mockBridgeQueue = [bridgeItem];
    mockBridgeCurrentClimbQueueItem = bridgeItem;

    render(<StartSeshDrawer open onClose={vi.fn()} />);

    // Board is auto-selected via pathname match, just submit
    await submitSesh();

    await waitFor(() => {
      expect(mockCreateSession).toHaveBeenCalled();
    });

    // Queue should be transferred from bridge state
    expect(mockSetInitialQueueForSession).toHaveBeenCalledWith('new-session-id', [bridgeItem], bridgeItem, undefined);

    // activateSession should fire using bridge board details
    expect(mockActivateSession).toHaveBeenCalledWith({
      sessionId: 'new-session-id',
      sessionName: undefined,
      boardPath: '/b/kilter-original-12x12',
      boardDetails: mockBridgeBoardDetails,
      parsedParams: {
        board_name: 'kilter',
        layout_id: 1,
        size_id: 10,
        set_ids: [1, 2],
        angle: 40,
      },
      namedBoardName: 'Kilter',
      namedBoardUuid: 'board-1',
    });
  });

  it('renders with bottom placement', () => {
    render(<StartSeshDrawer open onClose={vi.fn()} />);

    const drawer = screen.getByTestId('drawer');
    expect(drawer.getAttribute('data-placement')).toBe('bottom');
  });
});
