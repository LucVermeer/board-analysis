import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useReducer, useRef, useLayoutEffect } from 'react';
import { queueReducer, initialState as queueInitialState } from '@boardsesh/queue';
import type { QueueState, QueueSearchParams, ClimbQueueItem } from '@boardsesh/queue';
import { useQueueStorage } from '../use-queue-storage';
import type { ActiveSessionInfo } from '../../types';
import type { BoardDetails } from '@/app/lib/types';

// Defensive: the auto-finished pre-flight only runs with a persisted session +
// token; with a fresh fake-indexeddb there is neither, so this is never reached.
// Mock it anyway so a stray call can't hit the network.
vi.mock('@/app/lib/graphql/client', () => ({
  createGraphQLHttpClient: vi.fn(() => ({ request: vi.fn() })),
}));

const boardA = { layout_name: 'Board A', board_name: 'kilter' } as unknown as BoardDetails;
const boardB = { layout_name: 'Board B', board_name: 'tension' } as unknown as BoardDetails;

function makeItem(uuid: string): ClimbQueueItem {
  return {
    uuid,
    climb: { uuid: `climb-${uuid}` } as unknown as ClimbQueueItem['climb'],
    addedBy: null,
    suggested: false,
  };
}

// A party session carries the FULL pathname (angle + /list) in `boardPath`,
// exactly like production (see board-session-bridge.tsx: `boardPath: pathname`).
function session(boardPath: string, boardDetails: BoardDetails): ActiveSessionInfo {
  return {
    sessionId: `sess-${boardPath}`,
    boardPath,
    boardDetails,
    parsedParams: {} as unknown as ActiveSessionInfo['parsedParams'],
  };
}

type InjectTarget = { path: string; details: BoardDetails } | null;

// Pairs the REAL `useQueueStorage` with a REAL `@boardsesh/queue` reducer so
// `setBoardContext`'s `CLEAR_QUEUE` dispatch actually mutates observable queue
// state — the mock-free equivalent of `MockRootQueueProvider`.
//
// The optional `inject` mimics a board-route injector: it records the board
// context from a LAYOUT effect, which — like the production injector's
// `useLayoutEffect` — runs BEFORE the provider's passive party-end adoption
// effect. That ordering is what makes the party-end-vs-inject race reproducible.
function useHarness(props: {
  activeSession: ActiveSessionInfo | null;
  seedQueue: ClimbQueueItem[];
  inject?: InjectTarget;
}) {
  const { activeSession, seedQueue, inject = null } = props;
  const [state, dispatch] = useReducer(
    queueReducer<QueueSearchParams>,
    undefined,
    (): QueueState<QueueSearchParams> => ({
      ...queueInitialState<QueueSearchParams>({}),
      queue: seedQueue,
    }),
  );
  const storage = useQueueStorage({ activeSession, setActiveSession: () => {}, dispatch });
  const { setBoardContext } = storage;

  const injectPath = inject?.path ?? null;
  const injectDetailsRef = useRef(inject?.details);
  injectDetailsRef.current = inject?.details;
  useLayoutEffect(() => {
    if (injectPath && injectDetailsRef.current) setBoardContext(injectPath, injectDetailsRef.current);
    // Re-inject only when the target board path changes (mirrors the real
    // injector re-firing on board-route change). `setBoardContext` is a
    // []-deps stable callback, so it never widens this.
  }, [injectPath, setBoardContext]);

  return { state, storage };
}

type HarnessProps = Parameters<typeof useHarness>[0];

// Wrap renderHook so `Props` widens to HarnessProps (else it narrows from an
// `activeSession: null` initialProps and rerender rejects a real session).
function renderHarness(initialProps: HarnessProps) {
  return renderHook((props: HarnessProps) => useHarness(props), { initialProps });
}

async function flushMount(result: { current: ReturnType<typeof useHarness> }) {
  // Let the async mount restore effect settle so its setState doesn't leak into
  // a later act() and so assertions run against a stable state.
  await waitFor(() => expect(result.current.storage.isBoardContextLoaded).toBe(true));
}

describe('useQueueStorage — setBoardContext board-change clear', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('clears the solo queue when the board changes (board A queue must not carry to board B)', async () => {
    const { result } = renderHarness({ activeSession: null, seedQueue: [makeItem('u1')] });
    await flushMount(result);

    // Record board A first — no previous board, so nothing to clear.
    act(() => {
      result.current.storage.setBoardContext('/kilter/1/10/1,2', boardA);
    });
    expect(result.current.state.queue).toHaveLength(1);
    expect(result.current.storage.soloBoardPath).toBe('/kilter/1/10/1,2');

    // Navigate to a different board — the solo queue must NOT carry over.
    act(() => {
      result.current.storage.setBoardContext('/tension/2/10/1,2', boardB);
    });
    expect(result.current.state.queue).toHaveLength(0);
    expect(result.current.storage.soloBoardPath).toBe('/tension/2/10/1,2');
  });

  it('does NOT clear when the board is unchanged (angle / climb navigation within one board)', async () => {
    const { result } = renderHarness({ activeSession: null, seedQueue: [makeItem('u1')] });
    await flushMount(result);

    act(() => {
      result.current.storage.setBoardContext('/kilter/1/10/1,2', boardA);
    });
    act(() => {
      // Same base board (a new angle / climb selection resolves to the same base path).
      result.current.storage.setBoardContext('/kilter/1/10/1,2', boardA);
    });
    expect(result.current.state.queue).toHaveLength(1);
  });

  it('is a no-op while a party session is active (party queue state is server-owned)', async () => {
    const bSession = session('/tension/2/10/1,2/40/list', boardB);
    const { result } = renderHarness({ activeSession: bSession, seedQueue: [makeItem('u1')] });
    await flushMount(result);

    act(() => {
      result.current.storage.setBoardContext('/kilter/1/10/1,2', boardA);
    });
    // Guarded on activeSession: neither the queue nor the solo board path change.
    expect(result.current.state.queue).toHaveLength(1);
    expect(result.current.storage.soloBoardPath).toBeNull();
  });

  it('a board-route → board-route inject clears the carried solo queue on a board change (direct A→B navigation)', async () => {
    // Critical PR invariant: navigating directly from board A's route to board
    // B's route (no off-board stop) re-fires the injector, which records B via
    // setBoardContext — different board → CLEAR_QUEUE. The reducer runs for real
    // here, so the queue actually empties.
    const { result, rerender } = renderHarness({
      activeSession: null,
      seedQueue: [makeItem('u1')],
      inject: { path: '/kilter/1/10/1,2', details: boardA },
    });
    await flushMount(result);
    expect(result.current.storage.soloBoardPath).toBe('/kilter/1/10/1,2');
    expect(result.current.state.queue).toHaveLength(1);

    rerender({
      activeSession: null,
      seedQueue: [makeItem('u1')],
      inject: { path: '/tension/2/10/1,2', details: boardB },
    });

    expect(result.current.state.queue).toHaveLength(0);
    expect(result.current.storage.soloBoardPath).toBe('/tension/2/10/1,2');
  });

  it('a same-board inject in the same commit a party ends keeps the carried queue (no spurious CLEAR_QUEUE)', async () => {
    // Party-end vs inject race. Board B's injector re-injects in the SAME commit
    // that `activeSession` flips to null. The inject runs from a LAYOUT effect
    // (before the provider's passive adoption effect), so without the render-time
    // board stamp it would read the stale pre-party board and CLEAR_QUEUE the
    // just-carried queue.
    const bSession = session('/tension/2/10/1,2/40/list', boardB);

    const { result, rerender } = renderHarness({
      activeSession: null,
      seedQueue: [makeItem('u1')],
      inject: { path: '/kilter/1/10/1,2', details: boardA },
    });
    await flushMount(result);
    // Solo on board A.
    expect(result.current.storage.soloBoardPath).toBe('/kilter/1/10/1,2');

    // Join a party on board B. setBoardContext no-ops during a party, so the solo
    // board path stays A while the root queue holds board B's party queue. Keep
    // the SAME inject path (A) so the injector doesn't re-fire yet.
    rerender({
      activeSession: bSession,
      seedQueue: [makeItem('u1')],
      inject: { path: '/kilter/1/10/1,2', details: boardA },
    });

    // Party ends AND board B's injector re-injects — in one commit.
    rerender({
      activeSession: null,
      seedQueue: [makeItem('u1')],
      inject: { path: '/tension/2/10/1,2', details: boardB },
    });

    // The carried queue survives; the solo board is now B (base-normalized).
    expect(result.current.state.queue).toHaveLength(1);
    expect(result.current.storage.soloBoardPath).toBe('/tension/2/10/1,2');
  });
});
