// @vitest-environment jsdom
import { act, render, waitFor } from '@testing-library/react';
import { createElement, useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserBoard } from '@boardsesh/shared-schema';

// Self-contained QueueProvider harness scoped to clearSession's notifyServer
// option: an intentional session switch must emit LEAVE_SESSION so peers see
// the departure immediately (web parity with sendLeaveOnCleanup).

const ws = vi.hoisted(() => ({
  client: {
    on: vi.fn(() => vi.fn()),
    subscribe: vi.fn(() => vi.fn()),
  },
}));

const graph = vi.hoisted(() => ({ execute: vi.fn() }));
const http = vi.hoisted(() => ({ request: vi.fn() }));

const activeBoard = vi.hoisted(() => ({
  stored: {
    uuid: 'board-1',
    slug: 'board-1',
    ownerId: 'owner-1',
    boardType: 'kilter',
    layoutId: 1,
    sizeId: 10,
    setIds: '1,2',
    name: 'Test board',
    isPublic: true,
    isUnlisted: false,
    hideLocation: false,
    isOwned: true,
    angle: 40,
    isAngleAdjustable: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    totalAscents: 0,
    uniqueClimbers: 0,
    followerCount: 0,
    commentCount: 0,
    isFollowedByMe: false,
  } satisfies UserBoard,
  getStoredActiveBoard: vi.fn(),
}));

const queueMutations = vi.hoisted(() => ({
  addQueueItem: vi.fn(async () => {}),
  removeQueueItem: vi.fn(async () => {}),
  reorderQueueItem: vi.fn(async () => {}),
  setCurrentClimb: vi.fn(async () => {}),
  mirrorCurrentClimb: vi.fn(async () => {}),
  publishPlaybackState: vi.fn(async () => {}),
  setQueue: vi.fn(async () => {}),
  replaceQueueItem: vi.fn(async () => {}),
  takeControl: vi.fn(async () => {}),
  releaseControl: vi.fn(async () => {}),
  confirmClimbOnWall: vi.fn(async () => {}),
  setSessionBoardSerial: vi.fn(async () => {}),
  setSessionBoardPath: vi.fn(async () => {}),
}));

const sessionStore = vi.hoisted(() => ({
  getStoredSessionId: vi.fn(async () => 'session-1'),
  setStoredSessionId: vi.fn(async () => {}),
  clearStoredSessionId: vi.fn(async () => {}),
}));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('react-native', () => ({
  Platform: { OS: 'ios', select: (options: Record<string, unknown>) => options.ios ?? options.default },
  AppState: { addEventListener: vi.fn(() => ({ remove: vi.fn() })) },
}));
vi.mock('expo-crypto', () => ({ randomUUID: () => 'test-correlation-id' }));
vi.mock('@boardsesh/graphql-client', () => ({ execute: graph.execute }));
vi.mock('@boardsesh/queue-react', () => ({ useQueueMutations: () => queueMutations }));
vi.mock('@boardsesh/play-view', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@boardsesh/play-view')>()),
  emitWallConfirm: vi.fn(),
}));
vi.mock('../../lib/graphql/ws-client', () => ({ getWsClient: () => ws.client }));
vi.mock('../../lib/session-store', () => sessionStore);
vi.mock('../../lib/active-board-store', () => ({ getStoredActiveBoard: activeBoard.getStoredActiveBoard }));
vi.mock('../../lib/graphql/use-active-board', () => ({
  useActiveBoard: () => ({ data: activeBoard.stored }),
  useSetActiveBoard: () => vi.fn(async () => {}),
}));
vi.mock('../../lib/graphql/client', () => ({ getHttpClient: () => ({ request: http.request }) }));
vi.mock('../../lib/analytics', () => ({ track: vi.fn() }));
vi.mock('../toast-provider', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../queue-snackbar-provider', () => ({ useQueueSnackbar: () => ({ showQueueAddedSnackbar: vi.fn() }) }));

import { QueueProvider, useQueue, useQueueSessionId } from '../queue-provider';

type Snapshot = {
  sessionId: string | null;
  clearSession: ReturnType<typeof useQueue>['clearSession'];
};

function Probe({ onSnapshot }: { onSnapshot: (snapshot: Snapshot) => void }) {
  const queue = useQueue();
  const { sessionId } = useQueueSessionId();
  useEffect(() => {
    onSnapshot({ sessionId, clearSession: queue.clearSession });
  }, [sessionId, queue.clearSession, onSnapshot]);
  return null;
}

function leaveSessionCalls() {
  return graph.execute.mock.calls.filter((call) => {
    const operation = call[1] as { query?: string } | undefined;
    return typeof operation?.query === 'string' && operation.query.includes('leaveSession');
  });
}

describe('QueueProvider clearSession notifyServer', () => {
  beforeEach(() => {
    ws.client.on.mockClear();
    ws.client.subscribe.mockClear();
    activeBoard.getStoredActiveBoard.mockReset();
    activeBoard.getStoredActiveBoard.mockResolvedValue(activeBoard.stored);
    for (const mutation of Object.values(queueMutations) as Array<ReturnType<typeof vi.fn>>) {
      mutation.mockReset();
      mutation.mockResolvedValue(undefined);
    }
    sessionStore.getStoredSessionId.mockResolvedValue('session-1');
    sessionStore.clearStoredSessionId.mockClear();
    http.request.mockReset();
    http.request.mockResolvedValue({});
    graph.execute.mockReset();
    // joinSession resolves the active session; leaveSession resolves true.
    graph.execute.mockResolvedValue({
      joinSession: {
        participantId: 'participant-self',
        clientId: 'client-self',
        isLeader: false,
        driverParticipantId: null,
        lastConnectedBoardSerial: null,
        boardPath: '/kilter/1/10/1,2/40/list',
        users: [],
      },
      leaveSession: true,
    });
  });

  it('emits LEAVE_SESSION when clearSession is called with notifyServer:true (session switch)', async () => {
    const snapshots: Snapshot[] = [];
    render(createElement(QueueProvider, null, createElement(Probe, { onSnapshot: (snap) => snapshots.push(snap) })));

    // Wait for the stored session to load + JOIN_SESSION to resolve.
    await waitFor(() => expect(snapshots.at(-1)?.sessionId).toBe('session-1'));

    await act(async () => {
      await snapshots.at(-1)?.clearSession({ notifyServer: true });
    });

    // The backend was told we left, BEFORE local state reset cleared the id.
    expect(leaveSessionCalls()).toHaveLength(1);
    await waitFor(() => expect(snapshots.at(-1)?.sessionId).toBeNull());
  });

  it('does NOT emit LEAVE_SESSION for a plain clearSession (remote end / endSession callers)', async () => {
    const snapshots: Snapshot[] = [];
    render(createElement(QueueProvider, null, createElement(Probe, { onSnapshot: (snap) => snapshots.push(snap) })));

    await waitFor(() => expect(snapshots.at(-1)?.sessionId).toBe('session-1'));

    await act(async () => {
      await snapshots.at(-1)?.clearSession();
    });

    expect(leaveSessionCalls()).toHaveLength(0);
    await waitFor(() => expect(snapshots.at(-1)?.sessionId).toBeNull());
  });

  it('still clears local state when the leave mutation rejects (degrades to disconnect grace)', async () => {
    const snapshots: Snapshot[] = [];
    render(createElement(QueueProvider, null, createElement(Probe, { onSnapshot: (snap) => snapshots.push(snap) })));

    await waitFor(() => expect(snapshots.at(-1)?.sessionId).toBe('session-1'));

    graph.execute.mockRejectedValueOnce(new Error('ws wedged'));
    await act(async () => {
      await snapshots.at(-1)?.clearSession({ notifyServer: true });
    });

    // A failed leave must not block the local reset — the switch still proceeds.
    await waitFor(() => expect(snapshots.at(-1)?.sessionId).toBeNull());
  });
});
