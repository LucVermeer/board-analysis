import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BoardAdapterProvider, type BoardAdapter } from '../adapter';

// Defaults a hook test can opt into via partial-overrides. `executeHttp` /
// `executeWs` throw by default so an unexpected call surfaces as a clear
// "transport not configured" error rather than a hang.
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

export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, retryDelay: 0, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
}

/**
 * Test wrapper that mounts both a fresh QueryClientProvider and a
 * BoardAdapterProvider with the supplied adapter overrides on top of the
 * noop baseline. `queryClient` is exposed so tests can inspect cache
 * mutations (e.g. optimistic inserts, rollback).
 */
export function createWrapper(adapter: Partial<BoardAdapter> = {}) {
  const queryClient = createTestQueryClient();
  const fullAdapter: BoardAdapter = { ...noopAdapter, ...adapter };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <BoardAdapterProvider value={fullAdapter}>{children}</BoardAdapterProvider>
    </QueryClientProvider>
  );
  return { wrapper, queryClient, adapter: fullAdapter };
}
