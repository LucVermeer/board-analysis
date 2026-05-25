import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { createTestQueryClient } from '@/app/test-utils/test-providers';
import { useWsAuthToken } from '../use-ws-auth-token';
import { useSession } from 'next-auth/react';
import { useUpdateTick } from '../use-update-tick';

vi.mock('../use-ws-auth-token', () => ({
  useWsAuthToken: vi.fn(),
}));

vi.mock('next-auth/react', () => ({
  useSession: vi.fn(),
}));

const mockShowMessage = vi.fn();
vi.mock('@/app/components/providers/snackbar-provider', () => ({
  useSnackbar: () => ({ showMessage: mockShowMessage }),
}));

const mockRequest = vi.fn();
vi.mock('@/app/lib/graphql/client', () => ({
  createGraphQLHttpClient: () => ({ request: mockRequest }),
}));

vi.mock('@boardsesh/graphql/operations', () => ({
  UPDATE_TICK: 'UPDATE_TICK_MUTATION',
}));

const mockUseWsAuthToken = vi.mocked(useWsAuthToken);
const mockUseSession = vi.mocked(useSession);

function createTestWrapper() {
  const queryClient = createTestQueryClient();
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  return { wrapper, queryClient };
}

describe('useUpdateTick', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequest.mockReset();
    mockShowMessage.mockReset();
    mockUseWsAuthToken.mockReturnValue({
      token: 'test-token',
      isAuthenticated: true,
      isLoading: false,
      error: null,
    });
    mockUseSession.mockReturnValue({
      status: 'authenticated',
      data: { user: { id: '1' }, expires: '' },
      update: vi.fn(),
    });
  });

  it('throws when not authenticated', async () => {
    mockUseSession.mockReturnValue({
      status: 'unauthenticated',
      data: null,
      update: vi.fn(),
    });

    const { wrapper } = createTestWrapper();
    const { result } = renderHook(() => useUpdateTick(), { wrapper });

    await act(async () => {
      result.current.mutate({
        uuid: 'tick-1',
        input: { status: 'send', attemptCount: 1 },
      });
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.message).toBe('Not authenticated');
  });

  it('calls GraphQL mutation with the provided uuid and input', async () => {
    mockRequest.mockResolvedValue({
      updateTick: {
        uuid: 'tick-123',
        status: 'send',
        attemptCount: 1,
        quality: 4,
        difficulty: 22,
        isBenchmark: false,
        comment: 'Nice',
        updatedAt: '2026-04-17T00:00:00.000Z',
      },
    });

    const { wrapper } = createTestWrapper();
    const { result } = renderHook(() => useUpdateTick(), { wrapper });

    await act(async () => {
      result.current.mutate({
        uuid: 'tick-123',
        input: { status: 'send', attemptCount: 1, quality: 4, difficulty: 22, comment: 'Nice' },
      });
    });

    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledWith('UPDATE_TICK_MUTATION', {
        uuid: 'tick-123',
        input: { status: 'send', attemptCount: 1, quality: 4, difficulty: 22, comment: 'Nice' },
      });
    });
  });

  it('refreshes related caches and shows a success snackbar on success', async () => {
    mockRequest.mockResolvedValue({
      updateTick: {
        uuid: 'tick-1',
        status: 'flash',
        attemptCount: 1,
        quality: 5,
        difficulty: 22,
        isBenchmark: false,
        comment: 'Sent',
        updatedAt: '2026-04-17T00:00:00.000Z',
      },
    });

    const { wrapper, queryClient } = createTestWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const removeSpy = vi.spyOn(queryClient, 'removeQueries');

    const { result } = renderHook(() => useUpdateTick(), { wrapper });

    await act(async () => {
      result.current.mutate({
        uuid: 'tick-1',
        input: { status: 'flash', attemptCount: 1 },
      });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const invalidatedKeys = invalidateSpy.mock.calls.map((call) => call[0]?.queryKey);
    expect(invalidatedKeys).toContainEqual(['logbookFeed']);
    expect(invalidatedKeys).toContainEqual(['ascentsFeed']);
    expect(invalidatedKeys).toContainEqual(['sessionDetail']);
    expect(invalidatedKeys).toContainEqual(['userProfileStats']);
    expect(removeSpy).toHaveBeenCalledWith({ queryKey: ['logbook'] });
    expect(mockShowMessage).toHaveBeenCalledWith('Tick updated', 'success');
  });

  it('extracts GraphQL error messages for the snackbar', async () => {
    const graphqlError: Error & { response?: { errors: { message: string }[] } } = new Error('GraphQL error');
    graphqlError.response = {
      errors: [{ message: 'Not authorized to update this tick' }],
    };
    mockRequest.mockRejectedValue(graphqlError);

    const { wrapper } = createTestWrapper();
    const { result } = renderHook(() => useUpdateTick(), { wrapper });

    await act(async () => {
      result.current.mutate({
        uuid: 'tick-1',
        input: { status: 'attempt', attemptCount: 2 },
      });
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(mockShowMessage).toHaveBeenCalledWith('Not authorized to update this tick', 'error');
  });
});
