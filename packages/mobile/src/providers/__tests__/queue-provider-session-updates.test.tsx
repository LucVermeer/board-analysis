// @vitest-environment jsdom
import { act, render, waitFor } from '@testing-library/react';
import { createElement, useEffect, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionUser, UserBoard } from '@boardsesh/shared-schema';

const ws = vi.hoisted(() => {
  let sessionUpdatesSink: { next: (payload: { data?: { sessionUpdates?: unknown } }) => void } | null = null;
  return {
    getSessionUpdatesSink: () => sessionUpdatesSink,
    client: {
      on: vi.fn(() => vi.fn()),
      subscribe: vi.fn((request: { query: string }, sink: { next: (payload: unknown) => void }) => {
        if (request.query.includes('sessionUpdates')) {
          sessionUpdatesSink = sink as { next: (payload: { data?: { sessionUpdates?: unknown } }) => void };
        }
        return vi.fn();
      }),
    },
    reset: () => {
      sessionUpdatesSink = null;
    },
  };
});

const graph = vi.hoisted(() => ({
  execute: vi.fn(),
}));

const http = vi.hoisted(() => ({
  request: vi.fn(),
}));

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
  setActiveBoard: vi.fn(async () => {}),
}));

const toast = vi.hoisted(() => ({
  showToast: vi.fn(),
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

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('react-native', () => ({
  Platform: { OS: 'ios', select: (options: Record<string, unknown>) => options.ios ?? options.default },
  AppState: { addEventListener: vi.fn(() => ({ remove: vi.fn() })) },
}));

vi.mock('expo-crypto', () => ({
  randomUUID: () => 'test-correlation-id',
}));

vi.mock('@boardsesh/graphql-client', () => ({
  execute: graph.execute,
}));

vi.mock('@boardsesh/queue-react', () => ({
  useQueueMutations: () => queueMutations,
}));

vi.mock('../../lib/graphql/ws-client', () => ({
  getWsClient: () => ws.client,
}));

vi.mock('../../lib/session-store', () => ({
  getStoredSessionId: vi.fn(async () => 'session-1'),
  setStoredSessionId: vi.fn(async () => {}),
  clearStoredSessionId: vi.fn(async () => {}),
}));

vi.mock('../../lib/active-board-store', () => ({
  getStoredActiveBoard: activeBoard.getStoredActiveBoard,
}));

vi.mock('../../lib/graphql/use-active-board', () => ({
  useActiveBoard: () => ({ data: activeBoard.stored }),
  useSetActiveBoard: () => activeBoard.setActiveBoard,
}));

vi.mock('../../lib/graphql/client', () => ({
  getHttpClient: () => ({ request: http.request }),
}));

vi.mock('../../lib/analytics', () => ({
  track: vi.fn(),
}));

vi.mock('../toast-provider', () => ({
  useToast: () => ({ showToast: toast.showToast }),
}));

vi.mock('../queue-snackbar-provider', () => ({
  useQueueSnackbar: () => ({ showQueueAddedSnackbar: vi.fn() }),
}));

import { QueueProvider, useQueue } from '../queue-provider';

type Snapshot = {
  sessionId: string | null;
  users: SessionUser[];
  driverParticipantId: string | null;
  lastConnectedBoardSerial: string | null;
  joinSession: (sessionId: string, opts: Parameters<ReturnType<typeof useQueue>['joinSession']>[1]) => Promise<void>;
  endSession: () => Promise<unknown>;
  takeControl: ReturnType<typeof useQueue>['takeControl'];
  releaseControl: ReturnType<typeof useQueue>['releaseControl'];
  confirmClimbOnWall: ReturnType<typeof useQueue>['confirmClimbOnWall'];
  setSessionBoardSerial: ReturnType<typeof useQueue>['setSessionBoardSerial'];
};

const user = (overrides: Partial<SessionUser> = {}): SessionUser => ({
  id: 'participant-1',
  username: 'Alex',
  isLeader: false,
  avatarUrl: undefined,
  userId: 'db-user-1',
  connectionState: 'CONNECTED',
  ...overrides,
});

function Probe({ onSnapshot }: { onSnapshot: (snapshot: Snapshot) => void }) {
  const queue = useQueue();
  useEffect(() => {
    onSnapshot({
      sessionId: queue.sessionId,
      users: queue.sessionUsers,
      driverParticipantId: queue.driverParticipantId,
      lastConnectedBoardSerial: queue.lastConnectedBoardSerial,
      joinSession: queue.joinSession,
      endSession: queue.endSession,
      takeControl: queue.takeControl,
      releaseControl: queue.releaseControl,
      confirmClimbOnWall: queue.confirmClimbOnWall,
      setSessionBoardSerial: queue.setSessionBoardSerial,
    });
  }, [
    queue.sessionId,
    queue.sessionUsers,
    queue.driverParticipantId,
    queue.lastConnectedBoardSerial,
    queue.joinSession,
    queue.endSession,
    queue.takeControl,
    queue.releaseControl,
    queue.confirmClimbOnWall,
    queue.setSessionBoardSerial,
    onSnapshot,
  ]);
  return null;
}

function renderProvider(onSnapshot: (snapshot: Snapshot) => void) {
  return render(createElement(QueueProvider, null, createElement(Probe, { onSnapshot })));
}

describe('QueueProvider session update subscription', () => {
  beforeEach(() => {
    ws.reset();
    ws.client.on.mockClear();
    ws.client.subscribe.mockClear();
    activeBoard.stored = {
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
    };
    activeBoard.getStoredActiveBoard.mockReset();
    activeBoard.getStoredActiveBoard.mockResolvedValue(activeBoard.stored);
    activeBoard.setActiveBoard.mockClear();
    toast.showToast.mockClear();
    for (const mutation of Object.values(queueMutations)) {
      mutation.mockClear();
    }
    graph.execute.mockReset();
    http.request.mockReset();
    http.request.mockResolvedValue({
      endSession: {
        sessionId: 'session-1',
      },
    });
    graph.execute.mockResolvedValue({
      joinSession: {
        participantId: 'participant-self',
        clientId: 'client-self',
        isLeader: false,
        driverParticipantId: null,
        lastConnectedBoardSerial: null,
        boardPath: '/kilter/1/10/1,2/40/list',
        users: [user({ id: 'participant-self', username: 'Self', userId: 'db-self' })],
      },
    });
  });

  it('applies roster and driver events to public context state', async () => {
    const snapshots: Snapshot[] = [];
    renderProvider((snapshot) => snapshots.push(snapshot));

    await waitFor(() => {
      expect(ws.getSessionUpdatesSink()).not.toBeNull();
    });

    const sessionUpdatesSink = ws.getSessionUpdatesSink();
    if (!sessionUpdatesSink) throw new Error('session updates sink was not captured');

    act(() => {
      sessionUpdatesSink.next({
        data: {
          sessionUpdates: {
            __typename: 'UserJoined',
            user: user({ id: 'participant-2', username: 'Bo', userId: 'db-bo' }),
          },
        },
      });
    });
    act(() => {
      sessionUpdatesSink.next({
        data: {
          sessionUpdates: {
            __typename: 'DriverChanged',
            driverParticipantId: 'participant-2',
            previousDriverParticipantId: null,
          },
        },
      });
    });

    await waitFor(() => {
      const latestSnapshot = snapshots.at(-1);
      expect(latestSnapshot?.users.map((entry) => entry.id)).toEqual(['participant-self', 'participant-2']);
      expect(latestSnapshot?.driverParticipantId).toBe('participant-2');
    });
  });

  it('exposes shared party wall-control actions through the mobile queue context', async () => {
    const snapshots: Snapshot[] = [];
    renderProvider((snapshot) => snapshots.push(snapshot));

    await waitFor(() => {
      expect(snapshots.at(-1)?.sessionId).toBe('session-1');
    });

    const snapshot = snapshots.at(-1);
    if (!snapshot) throw new Error('queue snapshot was not captured');

    await snapshot.takeControl(null);
    await snapshot.releaseControl();
    await snapshot.confirmClimbOnWall('climb-1');
    await snapshot.setSessionBoardSerial('SERIAL-1');

    expect(queueMutations.takeControl).toHaveBeenCalledWith(null);
    expect(queueMutations.releaseControl).toHaveBeenCalledOnce();
    expect(queueMutations.confirmClimbOnWall).toHaveBeenCalledWith('climb-1');
    expect(queueMutations.setSessionBoardSerial).toHaveBeenCalledWith('SERIAL-1');
  });

  it('clears persisted session state when SessionEnded arrives', async () => {
    const snapshots: Snapshot[] = [];
    renderProvider((snapshot) => snapshots.push(snapshot));

    await waitFor(() => {
      expect(ws.getSessionUpdatesSink()).not.toBeNull();
    });

    const sessionUpdatesSink = ws.getSessionUpdatesSink();
    if (!sessionUpdatesSink) throw new Error('session updates sink was not captured');

    act(() => {
      sessionUpdatesSink.next({
        data: {
          sessionUpdates: {
            __typename: 'SessionEnded',
            reason: 'manual',
            newPath: null,
          },
        },
      });
    });

    await waitFor(() => {
      expect(snapshots.at(-1)?.sessionId).toBeNull();
    });
  });

  it('applies board serial and follows same-board angle changes', async () => {
    const snapshots: Snapshot[] = [];
    renderProvider((snapshot) => snapshots.push(snapshot));

    await waitFor(() => {
      expect(ws.getSessionUpdatesSink()).not.toBeNull();
    });

    const sessionUpdatesSink = ws.getSessionUpdatesSink();
    if (!sessionUpdatesSink) throw new Error('session updates sink was not captured');

    act(() => {
      sessionUpdatesSink.next({
        data: {
          sessionUpdates: {
            __typename: 'SessionBoardSerialChanged',
            lastConnectedBoardSerial: 'AURORA-1',
          },
        },
      });
    });
    act(() => {
      sessionUpdatesSink.next({
        data: {
          sessionUpdates: {
            __typename: 'SessionBoardPathChanged',
            boardPath: '/kilter/1/10/1,2/30/list',
            changedByParticipantId: 'participant-2',
          },
        },
      });
    });

    await waitFor(() => {
      expect(snapshots.at(-1)?.lastConnectedBoardSerial).toBe('AURORA-1');
      expect(activeBoard.setActiveBoard).toHaveBeenCalledWith({ ...activeBoard.stored, angle: 30 });
    });
  });

  it('ignores stale events from a previous session subscription after switching sessions', async () => {
    const snapshots: Snapshot[] = [];
    renderProvider((snapshot) => snapshots.push(snapshot));

    await waitFor(() => {
      expect(ws.getSessionUpdatesSink()).not.toBeNull();
    });

    const oldSessionUpdatesSink = ws.getSessionUpdatesSink();
    if (!oldSessionUpdatesSink) throw new Error('session updates sink was not captured');

    await act(async () => {
      await snapshots.at(-1)?.joinSession('session-2', {
        boardPath: '/kilter/1/10/1,2/40/list',
        userBoard: activeBoard.stored,
      });
    });

    await waitFor(() => {
      expect(snapshots.at(-1)?.sessionId).toBe('session-2');
    });

    act(() => {
      oldSessionUpdatesSink.next({
        data: {
          sessionUpdates: {
            __typename: 'DriverChanged',
            driverParticipantId: 'stale-driver',
            previousDriverParticipantId: null,
          },
        },
      });
    });
    act(() => {
      oldSessionUpdatesSink.next({
        data: {
          sessionUpdates: {
            __typename: 'SessionBoardPathChanged',
            boardPath: '/kilter/1/10/1,2/30/list',
            changedByParticipantId: 'participant-2',
          },
        },
      });
    });

    await waitFor(() => {
      expect(snapshots.at(-1)?.sessionId).toBe('session-2');
    });
    expect(snapshots.at(-1)?.driverParticipantId).not.toBe('stale-driver');
    expect(activeBoard.setActiveBoard).not.toHaveBeenCalledWith({ ...activeBoard.stored, angle: 30 });
  });

  it('does not apply an accepted board-path event after switching sessions before storage resolves', async () => {
    const snapshots: Snapshot[] = [];
    renderProvider((snapshot) => snapshots.push(snapshot));

    await waitFor(() => {
      expect(ws.getSessionUpdatesSink()).not.toBeNull();
    });

    const sessionUpdatesSink = ws.getSessionUpdatesSink();
    if (!sessionUpdatesSink) throw new Error('session updates sink was not captured');

    let resolveStoredBoard!: (board: UserBoard) => void;
    activeBoard.getStoredActiveBoard.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveStoredBoard = resolve;
      }),
    );

    act(() => {
      sessionUpdatesSink.next({
        data: {
          sessionUpdates: {
            __typename: 'SessionBoardPathChanged',
            boardPath: '/kilter/1/10/1,2/30/list',
            changedByParticipantId: 'participant-2',
          },
        },
      });
    });

    await act(async () => {
      await snapshots.at(-1)?.joinSession('session-2', {
        boardPath: '/kilter/1/10/1,2/40/list',
        userBoard: activeBoard.stored,
      });
    });

    await waitFor(() => {
      expect(snapshots.at(-1)?.sessionId).toBe('session-2');
    });

    await act(async () => {
      resolveStoredBoard(activeBoard.stored);
      await Promise.resolve();
    });

    expect(activeBoard.setActiveBoard).not.toHaveBeenCalledWith({ ...activeBoard.stored, angle: 30 });
  });

  it('ignores SessionEnded echoes while the local end-session mutation is in flight', async () => {
    const snapshots: Snapshot[] = [];
    renderProvider((snapshot) => snapshots.push(snapshot));

    await waitFor(() => {
      expect(ws.getSessionUpdatesSink()).not.toBeNull();
    });

    const sessionUpdatesSink = ws.getSessionUpdatesSink();
    if (!sessionUpdatesSink) throw new Error('session updates sink was not captured');

    let finishEndSession!: () => void;
    http.request.mockReturnValueOnce(
      new Promise((resolve) => {
        finishEndSession = () => resolve({ endSession: { sessionId: 'session-1' } });
      }),
    );

    const endSessionPromise = snapshots.at(-1)?.endSession();

    await waitFor(() => {
      expect(http.request).toHaveBeenCalled();
    });

    act(() => {
      sessionUpdatesSink.next({
        data: {
          sessionUpdates: {
            __typename: 'SessionEnded',
            reason: 'manual',
            newPath: null,
          },
        },
      });
    });

    expect(snapshots.at(-1)?.sessionId).toBe('session-1');

    await act(async () => {
      finishEndSession();
      await endSessionPromise;
    });

    await waitFor(() => {
      expect(snapshots.at(-1)?.sessionId).toBeNull();
    });
  });

  it('clears on a suppressed remote end when the local end-session mutation fails', async () => {
    const snapshots: Snapshot[] = [];
    renderProvider((snapshot) => snapshots.push(snapshot));

    await waitFor(() => {
      expect(ws.getSessionUpdatesSink()).not.toBeNull();
    });

    const sessionUpdatesSink = ws.getSessionUpdatesSink();
    if (!sessionUpdatesSink) throw new Error('session updates sink was not captured');

    let rejectEndSession!: (error: unknown) => void;
    http.request.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        rejectEndSession = reject;
      }),
    );

    const endSessionPromise = snapshots.at(-1)?.endSession();

    await waitFor(() => {
      expect(http.request).toHaveBeenCalled();
    });

    act(() => {
      sessionUpdatesSink.next({
        data: {
          sessionUpdates: {
            __typename: 'SessionEnded',
            reason: 'manual',
            newPath: null,
          },
        },
      });
    });

    expect(snapshots.at(-1)?.sessionId).toBe('session-1');

    await act(async () => {
      rejectEndSession(new Error('forbidden'));
      await endSessionPromise;
    });

    await waitFor(() => {
      expect(snapshots.at(-1)?.sessionId).toBeNull();
    });
    expect(toast.showToast).toHaveBeenCalledWith('mobile.toast.sessionEnded', 'success');
    expect(toast.showToast).not.toHaveBeenCalledWith('mobile.queue.actionFailed', 'error');
  });
});
