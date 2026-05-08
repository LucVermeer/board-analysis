import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DraftsDrawer from '../drafts-drawer';
import type { BoardDetails } from '@/app/lib/types';
import { tFromCatalog } from '@/app/__test-helpers__/i18n-mock';

vi.mock('react-i18next', () => ({
  useTranslation: (ns?: string) => ({
    t: (key: string, options?: Record<string, unknown>) => tFromCatalog(ns, key, options),
    i18n: { language: 'en-US' },
  }),
  Trans: ({ children }: { children?: React.ReactNode }) => children ?? null,
}));

const mockPush = vi.fn();
const mockRequest = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('@/app/hooks/use-color-mode', () => ({
  useColorMode: () => ({ mode: 'light' }),
}));

vi.mock('@/app/hooks/use-ws-auth-token', () => ({
  useWsAuthToken: () => ({ token: 'auth-token' }),
}));

vi.mock('@/app/lib/graphql/client', () => ({
  createGraphQLHttpClient: () => ({ request: mockRequest }),
}));

vi.mock('../../swipeable-drawer/swipeable-drawer', () => ({
  default: ({ children, open, disablePortal }: { children: React.ReactNode; open: boolean; disablePortal?: boolean }) =>
    open ? (
      <div data-testid="swipeable-drawer" data-disable-portal={disablePortal ? 'true' : 'false'}>
        {children}
      </div>
    ) : null,
}));

vi.mock('../../climb-card/climb-list-item', () => ({
  default: ({ climb, onSelect }: { climb: { uuid: string; name: string }; onSelect: () => void }) => (
    <div data-testid={`climb-item-${climb.uuid}`} onClick={onSelect}>
      {climb.name}
    </div>
  ),
}));

const boardDetails: BoardDetails = {
  board_name: 'kilter',
  layout_id: 1,
  size_id: 2,
  set_ids: [3, 4],
  images_to_holds: {},
  holdsData: [],
  edge_left: 0,
  edge_right: 100,
  edge_bottom: 0,
  edge_top: 100,
  boardHeight: 100,
  boardWidth: 100,
};

function renderDrawer(open = true) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const onClose = vi.fn();
  const result = render(
    <QueryClientProvider client={queryClient}>
      <DraftsDrawer open={open} onClose={onClose} boardDetails={boardDetails} angle={40} />
    </QueryClientProvider>,
  );
  return { ...result, onClose, queryClient };
}

describe('DraftsDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when closed', () => {
    renderDrawer(false);
    expect(screen.queryByTestId('swipeable-drawer')).toBeNull();
  });

  it('shows loading spinner while fetching drafts', async () => {
    // Never resolve so we stay in loading state
    mockRequest.mockReturnValue(new Promise(() => {}));
    renderDrawer();
    await waitFor(() => {
      expect(screen.getByRole('progressbar')).toBeTruthy();
    });
  });

  it('shows error message when query fails', async () => {
    mockRequest.mockRejectedValue(new Error('network error'));
    renderDrawer();
    await waitFor(() => {
      expect(screen.getByText(/Couldn't load your drafts/)).toBeTruthy();
    });
  });

  it('shows empty state when no drafts are returned', async () => {
    mockRequest.mockResolvedValue({ searchClimbs: { climbs: [], hasMore: false } });
    renderDrawer();
    await waitFor(() => {
      expect(screen.getByText('No drafts yet')).toBeTruthy();
    });
  });

  it('uses normal pixel padding for the empty state on narrow mobile drawers', async () => {
    mockRequest.mockResolvedValue({ searchClimbs: { climbs: [], hasMore: false } });
    renderDrawer();

    const emptyState = await screen.findByTestId('drafts-empty-state');

    expect(emptyState.style.padding).toBe('32px 24px');
  });

  it('keeps the draft list scroll gesture from being captured by the drawer', async () => {
    mockRequest.mockResolvedValue({ searchClimbs: { climbs: [], hasMore: false } });
    renderDrawer();

    await screen.findByTestId('drafts-empty-state');

    expect(screen.getByTestId('swipeable-drawer').getAttribute('data-disable-portal')).toBe('false');
    expect(screen.getByTestId('drafts-scroll-container').hasAttribute('data-swipe-blocked')).toBe(true);
  });

  it('renders draft climbs when query returns results', async () => {
    mockRequest.mockResolvedValue({
      searchClimbs: {
        climbs: [
          { uuid: 'draft-1', name: 'Draft Alpha', frames: '', angle: 40 },
          { uuid: 'draft-2', name: 'Draft Beta', frames: '', angle: 40 },
        ],
        hasMore: false,
      },
    });
    renderDrawer();
    await waitFor(() => {
      expect(screen.getByTestId('climb-item-draft-1')).toBeTruthy();
      expect(screen.getByTestId('climb-item-draft-2')).toBeTruthy();
    });
  });

  it('shows singular "draft" label for a single result', async () => {
    mockRequest.mockResolvedValue({
      searchClimbs: {
        climbs: [{ uuid: 'draft-1', name: 'Solo Draft', frames: '', angle: 40 }],
        hasMore: false,
      },
    });
    renderDrawer();
    await waitFor(() => {
      expect(screen.getByText('1 draft')).toBeTruthy();
    });
  });

  it('shows plural "drafts" label for multiple results', async () => {
    mockRequest.mockResolvedValue({
      searchClimbs: {
        climbs: [
          { uuid: 'draft-1', name: 'A', frames: '', angle: 40 },
          { uuid: 'draft-2', name: 'B', frames: '', angle: 40 },
        ],
        hasMore: false,
      },
    });
    renderDrawer();
    await waitFor(() => {
      expect(screen.getByText('2 drafts')).toBeTruthy();
    });
  });

  it('navigates to the climb view and closes when no onLoadDraft is provided', async () => {
    const onClose = vi.fn();
    mockRequest.mockResolvedValue({
      searchClimbs: {
        climbs: [{ uuid: 'draft-1', name: 'My Draft', frames: '', angle: 40 }],
        hasMore: false,
      },
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <DraftsDrawer open onClose={onClose} boardDetails={boardDetails} angle={40} />
      </QueryClientProvider>,
    );

    await waitFor(() => screen.getByTestId('climb-item-draft-1'));
    fireEvent.click(screen.getByTestId('climb-item-draft-1'));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledTimes(1);
    // URL should include the board name, layout, size, sets, angle and climb uuid/name
    const pushedUrl: string = mockPush.mock.calls[0][0];
    expect(pushedUrl).toContain('kilter');
    expect(pushedUrl).toContain('draft-1');
  });

  it('calls onLoadDraft with the climb and closes instead of navigating', async () => {
    const onClose = vi.fn();
    const onLoadDraft = vi.fn();
    mockRequest.mockResolvedValue({
      searchClimbs: {
        climbs: [{ uuid: 'draft-1', name: 'My Draft', frames: 'p1r42', angle: 40 }],
        hasMore: false,
      },
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <DraftsDrawer open onClose={onClose} boardDetails={boardDetails} angle={40} onLoadDraft={onLoadDraft} />
      </QueryClientProvider>,
    );

    await waitFor(() => screen.getByTestId('climb-item-draft-1'));
    fireEvent.click(screen.getByTestId('climb-item-draft-1'));

    expect(onLoadDraft).toHaveBeenCalledTimes(1);
    expect(onLoadDraft.mock.calls[0][0]).toMatchObject({ uuid: 'draft-1', name: 'My Draft' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('passes onlyDrafts: true in the query variables', async () => {
    mockRequest.mockResolvedValue({ searchClimbs: { climbs: [], hasMore: false } });
    renderDrawer();
    await waitFor(() => expect(mockRequest).toHaveBeenCalled());
    const [, variables] = mockRequest.mock.calls[0] as [unknown, { input: Record<string, unknown> }];
    expect(variables.input.onlyDrafts).toBe(true);
  });

  it('does not fetch when drawer is closed', () => {
    mockRequest.mockResolvedValue({ searchClimbs: { climbs: [], hasMore: false } });
    renderDrawer(false);
    expect(mockRequest).not.toHaveBeenCalled();
  });
});
