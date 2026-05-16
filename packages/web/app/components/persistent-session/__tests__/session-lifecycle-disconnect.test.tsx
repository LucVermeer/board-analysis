import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vite-plus/test';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setPreference } from '@/app/lib/user-preferences-db';
import type { BoardDetails } from '@/app/lib/types';
import { PersistentSessionProvider, usePersistentSession } from '../persistent-session-context';

// ---------------------------------------------------------------------------
// Mocks — capture the GraphQL client options so we can drive `onDisconnect`
// from the test, and hand out distinct unsubscribe spies for each subscribe()
// call so we can assert the queue + session subscriptions are torn down.
// ---------------------------------------------------------------------------

const { capturedOptions, queueUnsubscribe, sessionUnsubscribe, subscribeSpy, executeSpy } = vi.hoisted(() => ({
  capturedOptions: { current: null as { onDisconnect?: () => void } | null },
  queueUnsubscribe: vi.fn(),
  sessionUnsubscribe: vi.fn(),
  subscribeSpy: vi.fn(),
  executeSpy: vi.fn(),
}));

vi.mock('../../graphql-queue/graphql-client', () => ({
  createGraphQLClient: vi.fn((options) => {
    capturedOptions.current = options;
    return { dispose: vi.fn() };
  }),
  execute: executeSpy,
  subscribe: subscribeSpy,
}));

const { mockHttpRequest } = vi.hoisted(() => ({ mockHttpRequest: vi.fn() }));
vi.mock('@/app/lib/graphql/client', () => ({
  createGraphQLHttpClient: vi.fn(() => ({ request: mockHttpRequest })),
}));

vi.mock('@/app/hooks/use-ws-auth-token', () => ({
  useWsAuthToken: () => ({ token: 'test-token', isLoading: false }),
}));

vi.mock('../../party-manager/party-profile-context', () => ({
  usePartyProfile: () => ({ profile: { id: 'test-user' }, username: 'tester', avatarUrl: null }),
  PartyProfileProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

vi.mock('@/app/utils/hash', () => ({
  computeQueueStateHash: () => 'mock-hash',
}));

// The lifecycle hook bails out early when DEFAULT_BACKEND_URL is null, which
// it is under jsdom without NEXT_PUBLIC_WS_URL set. Force a value so the hook
// actually constructs the GraphQL client (the boundary we need to test).
vi.mock('@/app/lib/backend-url', () => ({
  getBackendWsUrl: () => 'ws://localhost/graphql',
  getGraphQLHttpUrl: () => 'http://localhost/graphql',
  getBackendHttpUrl: () => 'http://localhost',
}));

const ACTIVE_SESSION_KEY = 'activeSession';
const PREFS_DB_NAME = 'boardsesh-user-preferences';
const PREFS_STORE_NAME = 'preferences';

function createTestBoardDetails(): BoardDetails {
  return {
    board_name: 'kilter',
    layout_id: 1,
    size_id: 10,
    set_ids: '1,2',
    images_to_holds: {},
    holdsData: {},
    edge_left: 0,
    edge_right: 100,
    edge_bottom: 0,
    edge_top: 100,
    boardHeight: 100,
    boardWidth: 100,
    layout_name: 'Original',
    size_name: '12x12',
  } as unknown as BoardDetails;
}

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <PersistentSessionProvider>{children}</PersistentSessionProvider>
    </QueryClientProvider>
  );
}

beforeEach(async () => {
  capturedOptions.current = null;
  queueUnsubscribe.mockReset();
  sessionUnsubscribe.mockReset();
  subscribeSpy.mockReset();
  // Hand out distinct unsubscribe handles in subscribe call order — the
  // lifecycle hook subscribes to queueUpdates first, then sessionUpdates.
  subscribeSpy.mockReturnValueOnce(queueUnsubscribe).mockReturnValueOnce(sessionUnsubscribe);

  executeSpy.mockReset();
  // joinSession mutation: return a minimal Session payload sufficient for
  // setSession() + handleQueueEvent({ FullSync }) + startSubscriptions().
  executeSpy.mockResolvedValue({
    joinSession: {
      id: 'session-disconnect-test',
      name: null,
      boardPath: '/kilter/1/10/1,2/40/list',
      users: [],
      queueState: { queue: [], currentClimb: null, sequence: 0, stateHash: 'mock-hash' },
      isLeader: true,
      clientId: 'test-client',
    },
  });

  mockHttpRequest.mockReset();
  mockHttpRequest.mockResolvedValue({
    sessionSummary: {
      sessionId: 'session-disconnect-test',
      endedAt: null,
      startedAt: null,
      durationMinutes: 0,
      totalSends: 0,
      totalAttempts: 0,
      gradeDistribution: [],
      hardestClimb: null,
      participants: [],
      goal: null,
    },
  });

  try {
    const prefsDb = await openDB(PREFS_DB_NAME, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(PREFS_STORE_NAME)) db.createObjectStore(PREFS_STORE_NAME);
      },
    });
    await prefsDb.clear(PREFS_STORE_NAME);
    prefsDb.close();
  } catch {
    // DB may not exist yet
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useSessionLifecycle onDisconnect teardown', () => {
  it('clears queue + session subscription handles when the GraphQL client reports a socket close', async () => {
    await setPreference(ACTIVE_SESSION_KEY, {
      sessionId: 'session-disconnect-test',
      boardPath: '/kilter/1/10/1,2/40/list',
      boardDetails: createTestBoardDetails(),
      parsedParams: {
        board_name: 'kilter' as const,
        layout_id: 1,
        size_id: 10,
        set_ids: [1, 2],
        angle: 40,
      },
    });

    renderHook(() => usePersistentSession(), { wrapper: createWrapper() });

    // Wait for the lifecycle hook to connect, join, and start both subscriptions.
    await waitFor(() => {
      expect(subscribeSpy).toHaveBeenCalledTimes(2);
    });

    // The lifecycle hook must have wired an onDisconnect callback into the
    // GraphQL client — that's the bug fix this test is guarding.
    expect(capturedOptions.current?.onDisconnect).toBeTypeOf('function');

    // Drive the disconnect path the same way graphql-ws would on a socket
    // close. After this returns, the lifecycle's `handleDisconnect` must
    // have unsubscribed both queueUpdates and sessionUpdates so graphql-ws
    // has nothing to auto-replay on the next reconnect.
    capturedOptions.current?.onDisconnect?.();

    expect(queueUnsubscribe).toHaveBeenCalledTimes(1);
    expect(sessionUnsubscribe).toHaveBeenCalledTimes(1);
  });
});
