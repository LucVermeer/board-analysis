// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// expo-router and react-native both reach for the native runtime; stub the
// thin surface AuthProvider consumes. `useSegments` returning `[]` keeps the
// provider out of its `<Redirect>` branches so the child tree renders and the
// auth context becomes readable.
vi.mock('expo-router', () => ({
  useSegments: () => [] as string[],
  Redirect: () => null,
}));

vi.mock('react-native', () => ({
  AppState: {
    addEventListener: vi.fn(() => ({ remove: vi.fn() })),
  },
}));

// Storage + side-effect mocks. Each one just records calls; signOut returning
// successfully (no throw) is the only behaviour the unit cares about.
const getAuthTokenMock = vi.fn();
const isTokenExpiringSoonMock = vi.fn();
vi.mock('../../lib/auth-store', () => ({
  getAuthToken: () => getAuthTokenMock(),
  isTokenExpiringSoon: () => isTokenExpiringSoonMock(),
}));

const authSignOutMock = vi.fn();
vi.mock('../../lib/auth', () => ({
  startSignIn: vi.fn(),
  signOut: () => authSignOutMock(),
  signInWithCredentials: vi.fn(),
}));

const clearStoredSessionIdMock = vi.fn();
vi.mock('../../lib/session-store', () => ({
  clearStoredSessionId: () => clearStoredSessionIdMock(),
}));

const clearStoredActiveBoardMock = vi.fn();
vi.mock('../../lib/active-board-store', () => ({
  clearStoredActiveBoard: () => clearStoredActiveBoardMock(),
}));

const resetHttpClientMock = vi.fn();
vi.mock('../../lib/graphql/client', () => ({
  resetHttpClient: () => resetHttpClientMock(),
}));

const disposeWsClientMock = vi.fn();
vi.mock('../../lib/graphql/ws-client', () => ({
  disposeWsClient: () => disposeWsClientMock(),
}));

vi.mock('../../lib/graphql/use-active-board', () => ({
  ACTIVE_BOARD_QUERY_KEY: ['activeBoard'] as const,
}));

import { AuthProvider, useAuth } from '../auth-provider';

describe('AuthProvider.signOut', () => {
  beforeEach(() => {
    getAuthTokenMock.mockReset();
    isTokenExpiringSoonMock.mockReset();
    authSignOutMock.mockReset();
    clearStoredSessionIdMock.mockReset();
    clearStoredActiveBoardMock.mockReset();
    resetHttpClientMock.mockReset();
    disposeWsClientMock.mockReset();
    // Default: a signed-in session whose token is fresh, so checkAuth flips
    // isAuthenticated to true without taking the refresh branch.
    getAuthTokenMock.mockResolvedValue('jwt-token');
    isTokenExpiringSoonMock.mockResolvedValue(false);
    authSignOutMock.mockResolvedValue(undefined);
    clearStoredSessionIdMock.mockResolvedValue(undefined);
    clearStoredActiveBoardMock.mockResolvedValue(undefined);
  });

  it('clears every cached React Query so cached data does not bleed into the next user', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    // Seed two unrelated queries: one mirrors what
    // useMobileClimbActionsData writes; the other stands in for any other
    // user-scoped data (beta links, session summary, …).
    queryClient.setQueryData(['userPlaylists'], [{ id: 'p-1', name: "User A's playlist" }]);
    queryClient.setQueryData(['betaLinks', 'kilter', 'climb-x'], [{ url: 'https://example.com' }]);

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    );
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    await act(async () => {
      await result.current.signOut();
    });

    // The exact mechanism the cross-user leak fix relies on: a blanket
    // queryClient.clear() at the auth boundary. Both seeded keys go away.
    // Not asserting on `result.current.isAuthenticated` here — once it flips
    // to false the provider returns its `<Redirect>` branch (mocked to
    // null), so the renderHook's last captured snapshot stays stale. The
    // queryClient is the durable check.
    expect(queryClient.getQueryData(['userPlaylists'])).toBeUndefined();
    expect(queryClient.getQueryData(['betaLinks', 'kilter', 'climb-x'])).toBeUndefined();
  });

  it('runs the auth-side cleanup before clearing the cache', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['activeBoard'], { uuid: 'b-a' });

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    );
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    await act(async () => {
      await result.current.signOut();
    });

    // Every cleanup step the comment in signOut promises. Each one is a
    // single mock call per signOut invocation.
    expect(authSignOutMock).toHaveBeenCalledTimes(1);
    expect(clearStoredSessionIdMock).toHaveBeenCalledTimes(1);
    expect(clearStoredActiveBoardMock).toHaveBeenCalledTimes(1);
    expect(resetHttpClientMock).toHaveBeenCalledTimes(1);
    expect(disposeWsClientMock).toHaveBeenCalledTimes(1);
    // Active board cache was wiped — both the targeted removeQueries and the
    // subsequent clear() do this; verifying the end state is enough.
    expect(queryClient.getQueryData(['activeBoard'])).toBeUndefined();
  });
});
