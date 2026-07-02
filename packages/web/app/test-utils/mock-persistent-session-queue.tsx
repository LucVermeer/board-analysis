import React, { createContext, useContext, useReducer, useMemo } from 'react';
import { queueReducer, initialState as queueInitialState } from '@boardsesh/queue';
import type {
  QueueAction,
  QueueSearchParams,
  QueueState,
  ClimbQueueItem,
  PlaylistSuggestionSource,
} from '@boardsesh/queue';

/**
 * Test double for the root-owned queue reducer (W6 — `persistent-session` is
 * the single queue-state owner now; see
 * `packages/web/app/components/persistent-session/hooks/use-event-processor.ts`).
 *
 * Tests that mock `usePersistentSession`/`usePersistentSessionState`/
 * `usePersistentSessionActions` (rather than rendering the real
 * `PersistentSessionProvider`) need `queue`/`currentClimbQueueItem`/
 * `playlistSuggestionSource`/`pendingCurrentClimbUpdates`/`dispatch` to behave
 * like a REAL reducer: `GraphQLQueueProvider` and the bridge both dispatch
 * actions (`DELTA_ADD_QUEUE_ITEM`, etc.) and read the result back on the next
 * render. A plain mutable mock object can't do that — mutating a field on it
 * doesn't trigger a React re-render.
 *
 * `MockRootQueueProvider` owns ONE `useReducer(queueReducer, seed)` instance
 * and exposes it via a test-only context. Every mocked `usePersistentSession*`
 * call site within the same render tree reads it through `useMockRootQueueState`,
 * so they all share ONE reducer instance — mirroring the real
 * `PersistentSessionProvider` topology, where every consumer reads the same
 * root-owned state. (Without this, two independent `useReducer` calls in two
 * different mocked hook implementations would desync from each other.)
 */

type MockRootQueueContextValue = {
  state: QueueState<QueueSearchParams>;
  dispatch: (action: QueueAction<QueueSearchParams>) => void;
};

const MockRootQueueContext = createContext<MockRootQueueContextValue | null>(null);

export type MockRootQueueSeed = {
  queue?: ClimbQueueItem[];
  currentClimbQueueItem?: ClimbQueueItem | null;
  playlistSuggestionSource?: PlaylistSuggestionSource | null;
};

/**
 * Wrap a test's render tree with this so every mocked
 * `usePersistentSession()`/`usePersistentSessionState()`/`usePersistentSessionActions()`
 * call (via `useMockRootQueueState`, from inside your `vi.mock(...)` factory)
 * shares one reducer instance. `seed` is only read on mount — same contract as
 * a real reducer's lazy initial state — so pass a fresh `seed` per render
 * tree, not a shared mutable default.
 */
export function MockRootQueueProvider({ seed, children }: { seed?: MockRootQueueSeed; children: React.ReactNode }) {
  const [state, dispatch] = useReducer(
    queueReducer<QueueSearchParams>,
    undefined,
    (): QueueState<QueueSearchParams> => ({
      ...queueInitialState<QueueSearchParams>({}),
      queue: seed?.queue ?? [],
      currentClimbQueueItem: seed?.currentClimbQueueItem ?? null,
      playlistSuggestionSource: seed?.playlistSuggestionSource ?? null,
    }),
  );
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <MockRootQueueContext.Provider value={value}>{children}</MockRootQueueContext.Provider>;
}

/**
 * Read the shared mock reducer from within a
 * `vi.mock('.../persistent-session', ...)` factory's `usePersistentSession`/
 * `usePersistentSessionState`/`usePersistentSessionActions` implementations.
 * Spread `.state` and `.dispatch` into whatever else the mock needs to return
 * (activeSession, clientId, board-context fields, ...). Throws outside a
 * `MockRootQueueProvider` — every test that mocks `usePersistentSession` and
 * renders `GraphQLQueueProvider`/`QueueBridgeProvider` needs one now that
 * queue state is root-owned.
 */
export function useMockRootQueueState(): MockRootQueueContextValue {
  const context = useContext(MockRootQueueContext);
  if (!context) {
    throw new Error(
      'useMockRootQueueState must be used within a MockRootQueueProvider — wrap your test wrapper with it (see mock-persistent-session-queue.tsx).',
    );
  }
  return context;
}
