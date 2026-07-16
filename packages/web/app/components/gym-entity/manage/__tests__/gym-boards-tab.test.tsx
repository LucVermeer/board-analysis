import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import { tFromCatalog } from '@/app/__test-helpers__/i18n-mock';
import type { Gym, UserBoard } from '@boardsesh/shared-schema';
import GymBoardsTab from '../gym-boards-tab';

vi.mock('react-i18next', () => ({
  useTranslation: (ns?: string) => ({
    t: (key: string, options?: Record<string, unknown>) => tFromCatalog(ns, key, options),
    i18n: { language: 'en-US' },
  }),
  Trans: ({ children }: { children?: React.ReactNode }) => children ?? null,
}));

vi.mock('@/app/components/providers/snackbar-provider', () => ({
  useSnackbar: () => ({ showMessage: vi.fn() }),
}));

vi.mock('@/app/hooks/use-ws-auth-token', () => ({
  useWsAuthToken: () => ({ token: 'test-token', isAuthenticated: true, isLoading: false, error: null }),
}));

const mockSessionUserId = { current: 'user-owner' };
vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { id: mockSessionUserId.current } }, status: 'authenticated' }),
}));

// One shared execute mock for both link and unlink useEntityMutation instances;
// tests control its resolution to exercise the success and failure paths.
const mockExecute = vi.fn();
vi.mock('@/app/hooks/use-entity-mutation', () => ({
  useEntityMutation: () => ({ execute: mockExecute, token: 'test-token' }),
}));

const mockRequest = vi.fn();
vi.mock('@/app/lib/graphql/client', () => ({
  createGraphQLHttpClient: () => ({ request: mockRequest }),
}));

const GYM_UUID = 'gym-uuid-1';

const gym = {
  uuid: GYM_UUID,
  ownerId: 'user-owner',
  myRole: 'admin',
  name: 'Test Gym',
  slug: 'test-gym',
} as unknown as Gym;

function makeBoard(overrides: Partial<UserBoard>): UserBoard {
  return {
    uuid: 'board-1',
    slug: 'board-1',
    ownerId: 'user-owner',
    boardType: 'kilter',
    layoutId: 1,
    sizeId: 1,
    setIds: '1',
    name: 'Garage Board',
    isPublic: true,
    isUnlisted: false,
    hideLocation: false,
    isOwned: true,
    angle: 40,
    isAngleAdjustable: true,
    createdAt: '2026-01-01',
    totalAscents: 0,
    uniqueClimbers: 0,
    followerCount: 0,
    commentCount: 0,
    isFollowedByMe: false,
    ...overrides,
  } as UserBoard;
}

/** Routes the shared request mock by operation: gymBoards list vs myBoards. */
function stubRequests({ gymBoards, myBoards }: { gymBoards: UserBoard[]; myBoards: UserBoard[] }) {
  mockRequest.mockImplementation(async (document: string) => {
    if (typeof document === 'string' && document.includes('gymBoards')) {
      return { gymBoards };
    }
    return { myBoards: { boards: myBoards, totalCount: myBoards.length, hasMore: false } };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSessionUserId.current = 'user-owner';
});

describe('GymBoardsTab — add-board dialog', () => {
  const candidate = makeBoard({ uuid: 'board-new', name: 'New Wall', gymUuid: null });

  async function openDialogWithCandidate() {
    stubRequests({ gymBoards: [], myBoards: [candidate] });
    render(<GymBoardsTab gym={gym} onGymChange={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: /add a board/i }));
    await screen.findByText('New Wall');
  }

  it('keeps the candidate visible when the link mutation fails, so the user can retry', async () => {
    await openDialogWithCandidate();
    mockExecute.mockResolvedValueOnce(null); // useEntityMutation resolves null on failure

    fireEvent.click(screen.getByRole('button', { name: /^link$/i }));

    await waitFor(() => expect(mockExecute).toHaveBeenCalledTimes(1));
    expect(screen.getByText('New Wall')).toBeTruthy();
  });

  it('removes the candidate after a successful link', async () => {
    await openDialogWithCandidate();
    mockExecute.mockResolvedValueOnce({ linkBoardToGym: true });

    fireEvent.click(screen.getByRole('button', { name: /^link$/i }));

    await waitFor(() => expect(screen.queryByText('New Wall')).toBeNull());
  });
});

describe('GymBoardsTab — permission gating', () => {
  it('hides Unlink and shows the owner-only note for boards the viewer does not own', async () => {
    stubRequests({
      gymBoards: [makeBoard({ uuid: 'board-foreign', name: 'Foreign Board', ownerId: 'someone-else' })],
      myBoards: [],
    });
    render(<GymBoardsTab gym={gym} onGymChange={vi.fn()} />);

    await screen.findByText('Foreign Board');
    expect(screen.queryByRole('button', { name: /unlink/i })).toBeNull();
    expect(screen.getByText(/only the board's owner can unlink it/i)).toBeTruthy();
  });

  it('hides the add-board affordance for gym editors and shows the read-only hint', async () => {
    mockSessionUserId.current = 'user-editor';
    const editorGym = { ...gym, ownerId: 'user-owner', myRole: 'editor' } as unknown as Gym;
    stubRequests({ gymBoards: [], myBoards: [] });
    render(<GymBoardsTab gym={editorGym} onGymChange={vi.fn()} />);

    await screen.findByText(/no boards linked yet/i);
    expect(screen.queryByRole('button', { name: /add a board/i })).toBeNull();
    expect(screen.getByText(/only the gym owner or an admin can link boards/i)).toBeTruthy();
  });
});
