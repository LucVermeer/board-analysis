import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import UserClimbList from '../user-climb-list';

// --- Mocks ---

const mockRequest = vi.fn();

vi.mock('@/app/lib/graphql/client', () => ({
  createGraphQLHttpClient: () => ({ request: mockRequest }),
}));

vi.mock('@/app/hooks/use-ws-auth-token', () => ({
  useWsAuthToken: () => ({
    token: 'mock-token',
    isLoading: false,
    isAuthenticated: true,
    error: null,
  }),
}));

vi.mock('@boardsesh/graphql/operations', () => ({
  GET_USER_CLIMBS: 'GET_USER_CLIMBS',
}));

vi.mock('../multiboard-climb-list', () => ({
  default: (props: { climbs: unknown[]; totalCount: number; isLoading: boolean; hasMore: boolean }) => (
    <div
      data-testid="multiboard-climb-list"
      data-count={props.climbs.length}
      data-total={props.totalCount}
      data-loading={props.isLoading}
      data-has-more={props.hasMore}
    />
  ),
}));

// --- Import after mocks ---

// --- Helpers ---

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, retryDelay: 0 } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

function makeClimbsResponse(count: number, hasMore = false) {
  return {
    userClimbs: {
      climbs: Array.from({ length: count }, (_, i) => ({
        uuid: `climb-${i}`,
        name: `Climb ${i}`,
        layoutId: 1,
        setter_username: 'setter',
        description: '',
        frames: '',
        angle: 40,
        ascensionist_count: 10 - i,
        difficulty: 'V3',
        quality_average: '3.5',
        stars: 4,
        difficulty_error: '0.1',
        benchmark_difficulty: null,
        boardType: 'kilter',
      })),
      totalCount: count,
      hasMore,
    },
  };
}

describe('UserClimbList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders MultiboardClimbList with fetched climbs', async () => {
    mockRequest.mockResolvedValueOnce(makeClimbsResponse(3));

    render(<UserClimbList userId="user-1" />, { wrapper: createWrapper() });

    await waitFor(() => {
      const list = screen.getByTestId('multiboard-climb-list');
      expect(list.getAttribute('data-count')).toBe('3');
      expect(list.getAttribute('data-total')).toBe('3');
    });
  });

  it('shows loading state initially', () => {
    mockRequest.mockReturnValue(new Promise(() => {})); // Never resolves

    render(<UserClimbList userId="user-1" />, { wrapper: createWrapper() });

    const list = screen.getByTestId('multiboard-climb-list');
    expect(list.getAttribute('data-loading')).toBe('true');
  });

  it('passes userId to the GraphQL query', async () => {
    mockRequest.mockResolvedValueOnce(makeClimbsResponse(0));

    render(<UserClimbList userId="user-42" />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledWith(
        'GET_USER_CLIMBS',
        expect.objectContaining({
          input: expect.objectContaining({ userId: 'user-42' }),
        }),
      );
    });
  });

  it('passes hasMore from response', async () => {
    mockRequest.mockResolvedValueOnce(makeClimbsResponse(20, true));

    render(<UserClimbList userId="user-1" />, { wrapper: createWrapper() });

    await waitFor(() => {
      const list = screen.getByTestId('multiboard-climb-list');
      expect(list.getAttribute('data-has-more')).toBe('true');
    });
  });

  it('renders empty list when no climbs', async () => {
    mockRequest.mockResolvedValueOnce(makeClimbsResponse(0));

    render(<UserClimbList userId="user-1" />, { wrapper: createWrapper() });

    await waitFor(() => {
      const list = screen.getByTestId('multiboard-climb-list');
      expect(list.getAttribute('data-count')).toBe('0');
      expect(list.getAttribute('data-total')).toBe('0');
    });
  });
});
