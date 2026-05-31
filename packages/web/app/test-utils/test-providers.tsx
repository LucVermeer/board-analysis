import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BoardAdapterProvider, type BoardAdapter } from '@boardsesh/board-react';

/**
 * Creates a QueryClient configured for testing (no retries, no refetch on window focus).
 */
export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        retryDelay: 0,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

/**
 * Creates a wrapper component that provides a QueryClient for hook tests.
 * Each call creates a fresh QueryClient to isolate tests.
 */
export function createQueryWrapper() {
  const queryClient = createTestQueryClient();
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = 'QueryClientWrapper';
  return Wrapper;
}

const noopAdapter: BoardAdapter = {
  isAuthenticated: true,
  isAuthLoading: false,
  executeHttp: async () => {
    throw new Error('executeHttp not configured for this test');
  },
  executeWs: async () => {
    throw new Error('executeWs not configured for this test');
  },
  resolveActiveSessionId: () => undefined,
};

/**
 * Wraps a hook test in both a QueryClientProvider and a
 * BoardAdapterProvider. Pass a static adapter override or a getter
 * function that's called on every render — the getter form lets tests flip
 * auth state mid-test (`mockUseSession.mockReturnValue(...)` + `rerender`)
 * and have the adapter pick up the new value.
 *
 * Pass a fresh queryClient if you need to inspect it from the test;
 * otherwise one is created internally.
 */
export function createBoardAdapterWrapper(
  adapter: Partial<BoardAdapter> | (() => Partial<BoardAdapter>) = {},
  options: { queryClient?: QueryClient } = {},
) {
  const queryClient = options.queryClient ?? createTestQueryClient();
  const resolveAdapter = (): BoardAdapter => ({
    ...noopAdapter,
    ...(typeof adapter === 'function' ? adapter() : adapter),
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <BoardAdapterProvider value={resolveAdapter()}>{children}</BoardAdapterProvider>
    </QueryClientProvider>
  );
  Wrapper.displayName = 'BoardAdapterTestWrapper';
  return Wrapper;
}
