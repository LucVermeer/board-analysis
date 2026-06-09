import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { tFromCatalog } from '@/app/__test-helpers__/i18n-mock';
import MyBoardsDrawer from '../my-boards-drawer';

vi.mock('react-i18next', () => ({
  useTranslation: (ns?: string) => ({
    t: (key: string, options?: Record<string, unknown>) => tFromCatalog(ns, key, options),
    i18n: { language: 'en-US' },
  }),
  Trans: ({ children }: { children?: React.ReactNode }) => children ?? null,
}));

// jsdom/happy-dom doesn't implement IntersectionObserver, which the infinite-scroll
// hook in MyBoardsDrawer instantiates on mount. Provide a no-op stub so the effect
// doesn't throw during render.
class IntersectionObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
globalThis.IntersectionObserver = IntersectionObserverStub as unknown as typeof IntersectionObserver;

// Mock data
let mockBoards: Array<Record<string, unknown>> = [];
let mockIsLoading = false;
let mockError: string | null = null;

vi.mock('@/app/hooks/use-my-boards', () => ({
  useMyBoards: () => ({
    boards: mockBoards,
    isLoading: mockIsLoading,
    isFetchingMore: false,
    hasMore: false,
    loadMore: vi.fn(),
    error: mockError,
  }),
}));

vi.mock('@/app/hooks/use-ws-auth-token', () => ({
  useWsAuthToken: () => ({ token: 'test-token', isAuthenticated: true }),
}));

vi.mock('../../swipeable-drawer/swipeable-drawer', () => ({
  default: ({
    open,
    children,
    title,
    extra,
  }: {
    open: boolean;
    children: React.ReactNode;
    title: React.ReactNode;
    extra?: React.ReactNode;
    onClose: () => void;
  }) =>
    open ? (
      <div data-testid="drawer">
        <div data-testid="drawer-header">
          <span data-testid="drawer-title">{title}</span>
          {extra && <span data-testid="drawer-extra">{extra}</span>}
        </div>
        {children}
      </div>
    ) : null,
}));

vi.mock('../../board-entity/board-detail', () => ({
  BoardDetailContent: ({
    boardUuid,
    onDeleted,
  }: {
    boardUuid: string;
    initialIsFollowing?: boolean;
    onDeleted?: () => void;
    onFollowChange?: (boardUuid: string, isFollowing: boolean) => void;
  }) => (
    <div data-testid="board-detail-content">
      <span>Board: {boardUuid}</span>
      {onDeleted && (
        <button type="button" onClick={onDeleted} data-testid="delete-board">
          Delete
        </button>
      )}
    </div>
  ),
}));

vi.mock('../../social/board-search-results', () => ({
  default: ({
    query,
    onBoardSelect,
  }: {
    query: string;
    authToken: string | null;
    showFollowButton?: boolean;
    onBoardSelect?: (board: Record<string, unknown>) => void;
  }) => (
    <div data-testid="board-search-results">
      <span>Query: {query}</span>
      {onBoardSelect && (
        <button
          type="button"
          data-testid="select-search-result"
          onClick={() => onBoardSelect({ uuid: 'search-board-1', name: 'Found Board', isFollowedByMe: true })}
        >
          Select Board
        </button>
      )}
    </div>
  ),
}));

vi.mock('../my-boards-drawer.module.css', () => ({
  default: new Proxy(
    {},
    {
      get: (_target, prop) => String(prop),
    },
  ),
}));

function makeBoard(overrides?: Record<string, unknown>) {
  return {
    uuid: 'board-1',
    slug: 'my-kilter',
    ownerId: 'user-1',
    boardType: 'kilter',
    layoutId: 8,
    sizeId: 25,
    setIds: '26,27',
    angle: 40,
    name: 'My Kilter Board',
    locationName: 'Home Gym',
    isPublic: true,
    isOwned: true,
    isAngleAdjustable: true,
    createdAt: '2024-01-01T00:00:00Z',
    totalAscents: 0,
    uniqueClimbers: 0,
    followerCount: 0,
    commentCount: 0,
    isFollowedByMe: false,
    ...overrides,
  };
}

describe('MyBoardsDrawer', () => {
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockBoards = [];
    mockIsLoading = false;
    mockError = null;
  });

  it('does not render when closed', () => {
    render(<MyBoardsDrawer open={false} onClose={mockOnClose} />);
    expect(screen.queryByTestId('drawer')).toBeNull();
  });

  it('renders loading state', () => {
    mockIsLoading = true;
    render(<MyBoardsDrawer open onClose={mockOnClose} />);
    expect(screen.getByTestId('my-boards-loading')).toBeDefined();
  });

  it('renders empty state when no boards', () => {
    mockBoards = [];
    mockIsLoading = false;
    render(<MyBoardsDrawer open onClose={mockOnClose} />);
    expect(screen.getByTestId('my-boards-empty')).toBeDefined();
    expect(screen.getByText(/No boards yet/)).toBeDefined();
  });

  it('renders board list with boards', () => {
    mockBoards = [
      makeBoard(),
      makeBoard({ uuid: 'board-2', name: 'My Tension', boardType: 'tension', locationName: null }),
    ];
    render(<MyBoardsDrawer open onClose={mockOnClose} />);
    expect(screen.getByTestId('my-boards-list')).toBeDefined();
    expect(screen.getByText('My Kilter Board')).toBeDefined();
    expect(screen.getByText('My Tension')).toBeDefined();
  });

  it('shows board metadata with type, location, and angle', () => {
    mockBoards = [makeBoard()];
    render(<MyBoardsDrawer open onClose={mockOnClose} />);
    expect(screen.getByText('Kilter \u00B7 Home Gym \u00B7 40\u00B0')).toBeDefined();
  });

  it('navigates to board detail when clicking a board', () => {
    mockBoards = [makeBoard()];
    render(<MyBoardsDrawer open onClose={mockOnClose} />);

    fireEvent.click(screen.getByTestId('board-item-board-1'));

    expect(screen.getByTestId('board-detail-content')).toBeDefined();
    expect(screen.getByText('Board: board-1')).toBeDefined();
    // List should no longer be visible
    expect(screen.queryByTestId('my-boards-list')).toBeNull();
  });

  it('renders error state when fetch fails', () => {
    mockError = 'Failed to load your boards';
    render(<MyBoardsDrawer open onClose={mockOnClose} />);
    expect(screen.getByTestId('my-boards-error')).toBeDefined();
    expect(screen.getByText('Failed to load your boards')).toBeDefined();
  });

  it('navigates to search view when search icon is clicked', () => {
    mockBoards = [makeBoard()];
    render(<MyBoardsDrawer open onClose={mockOnClose} />);

    fireEvent.click(screen.getByLabelText('Find a board'));

    expect(screen.getByTestId('board-search-results')).toBeDefined();
    expect(screen.queryByTestId('my-boards-list')).toBeNull();
  });

  it('navigates back from board detail to list', () => {
    mockBoards = [makeBoard()];
    render(<MyBoardsDrawer open onClose={mockOnClose} />);

    // Navigate to board detail
    fireEvent.click(screen.getByTestId('board-item-board-1'));
    expect(screen.getByTestId('board-detail-content')).toBeDefined();

    // Click back
    fireEvent.click(screen.getByLabelText('Back'));
    expect(screen.getByTestId('my-boards-list')).toBeDefined();
    expect(screen.queryByTestId('board-detail-content')).toBeNull();
  });

  it('navigates from search to board detail and back to search', () => {
    mockBoards = [makeBoard()];
    render(<MyBoardsDrawer open onClose={mockOnClose} />);

    // Navigate to search
    fireEvent.click(screen.getByLabelText('Find a board'));
    expect(screen.getByTestId('board-search-results')).toBeDefined();

    // Select a board from search
    fireEvent.click(screen.getByTestId('select-search-result'));
    expect(screen.getByTestId('board-detail-content')).toBeDefined();
    expect(screen.getByText('Board: search-board-1')).toBeDefined();

    // Back should return to search
    fireEvent.click(screen.getByLabelText('Back'));
    expect(screen.getByTestId('board-search-results')).toBeDefined();
    expect(screen.queryByTestId('board-detail-content')).toBeNull();
  });

  it('returns to list view when board is deleted', () => {
    mockBoards = [makeBoard()];
    render(<MyBoardsDrawer open onClose={mockOnClose} />);

    // Navigate to board detail
    fireEvent.click(screen.getByTestId('board-item-board-1'));
    expect(screen.getByTestId('board-detail-content')).toBeDefined();

    // Delete the board
    fireEvent.click(screen.getByTestId('delete-board'));
    expect(screen.queryByTestId('board-detail-content')).toBeNull();
    expect(screen.getByTestId('my-boards-list')).toBeDefined();
  });
});
