import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';
import { renderHook, act } from '@testing-library/react';
import type { MutableRefObject } from 'react';
import { createQueueSyncGate } from '@boardsesh/queue-runtime';
import type { ActiveSessionInfo, Session } from '../types';
import type { ClimbQueueItem as LocalClimbQueueItem } from '../../queue-control/types';

// `DEFAULT_BACKEND_URL` is a module-const resolved from the page host, which is
// null under jsdom — force a non-null URL so the connection effect actually
// builds a controller.
vi.mock('@/app/lib/backend-url', () => ({
  getBackendWsUrl: () => 'ws://localhost:8080/graphql',
  deriveWsUrlFromHost: () => null,
}));

// Each `createSessionConnectionController` call returns a fresh stub controller;
// `controllers` records them in order so the test can assert teardown/rebuild.
const { createControllerMock, controllers } = vi.hoisted(() => {
  const recorded: Array<{
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    triggerResync: ReturnType<typeof vi.fn>;
  }> = [];
  const factory = vi.fn(() => {
    const controller = { start: vi.fn(), stop: vi.fn(), triggerResync: vi.fn() };
    recorded.push(controller);
    return controller;
  });
  return { createControllerMock: factory, controllers: recorded };
});
vi.mock('@boardsesh/queue-runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@boardsesh/queue-runtime')>();
  return { ...actual, createSessionConnectionController: createControllerMock };
});

// The real deps builder wires up GraphQL clients; stub it and capture the args
// so the test can inspect the token the rebuild read from the ref.
type DepsArg = { refs: { wsAuthTokenRef: MutableRefObject<string | null> } };
const { createDepsMock } = vi.hoisted(() => ({ createDepsMock: vi.fn((_deps: unknown) => ({})) }));
vi.mock('../hooks/session-connection-ports', () => ({
  createWebSessionConnectionDeps: createDepsMock,
  applySessionEvent: vi.fn(),
  transformToSubscriptionEvent: vi.fn(),
}));

import { useSessionLifecycle } from '../hooks/use-session-lifecycle';

function activeSession(sessionId: string, boardName: string): ActiveSessionInfo {
  return {
    sessionId,
    boardPath: `/${boardName}/1/10/1,2/40/list`,
    boardDetails: { board_name: boardName } as unknown as ActiveSessionInfo['boardDetails'],
    parsedParams: { board_name: boardName } as unknown as ActiveSessionInfo['parsedParams'],
  };
}

function buildRefs() {
  return {
    wsAuthTokenRef: { current: null } as MutableRefObject<string | null>,
    usernameRef: { current: undefined } as MutableRefObject<string | undefined>,
    avatarUrlRef: { current: undefined } as MutableRefObject<string | undefined>,
    sessionRef: { current: null } as MutableRefObject<Session | null>,
    activeSessionRef: { current: null } as MutableRefObject<ActiveSessionInfo | null>,
    queueRef: { current: [] } as MutableRefObject<LocalClimbQueueItem[]>,
    currentClimbQueueItemRef: { current: null } as MutableRefObject<LocalClimbQueueItem | null>,
    triggerResyncRef: { current: null } as MutableRefObject<(() => void) | null>,
    lastReceivedSequenceRef: { current: null } as MutableRefObject<number | null>,
  };
}

describe('useSessionLifecycle — socket rebuild on ws auth token recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    controllers.length = 0;
  });

  it('tears the anonymous controller down and rebuilds it authenticated when the token recovers', () => {
    const refs = buildRefs();
    const baseArgs = {
      isAuthLoading: false,
      hasWsAuthToken: false,
      handleQueueEvent: vi.fn(),
      handleSessionEvent: vi.fn(),
      syncGate: createQueueSyncGate(),
      refs,
    };

    const { result, rerender } = renderHook((props) => useSessionLifecycle(props), { initialProps: baseArgs });

    // Activate a session while the token is still null: the effect builds an
    // anonymous controller (the degraded state the fix must recover from).
    act(() => {
      result.current.activateSession(activeSession('s1', 'kilter'));
    });

    expect(createControllerMock).toHaveBeenCalledTimes(1);
    expect(controllers[0].start).toHaveBeenCalledTimes(1);

    // Token recovers. The provider's ref-sync effect runs before this hook's
    // effect, so the ref already carries the fresh token by rebuild time; model
    // that by planting the token in the ref, then flipping the presence dep.
    refs.wsAuthTokenRef.current = 'recovered-token';
    rerender({ ...baseArgs, hasWsAuthToken: true });

    // The anonymous controller was stopped and a brand-new one built — never a
    // second controller alongside the first.
    expect(controllers[0].stop).toHaveBeenCalledTimes(1);
    expect(createControllerMock).toHaveBeenCalledTimes(2);
    expect(controllers[1].start).toHaveBeenCalledTimes(1);

    // The rebuild's deps read the recovered token from the ref.
    const lastDeps = createDepsMock.mock.calls.at(-1)?.[0] as DepsArg | undefined;
    expect(lastDeps?.refs.wsAuthTokenRef.current).toBe('recovered-token');
  });

  it('does not rebuild the socket when the token value merely rotates (presence unchanged)', () => {
    const refs = buildRefs();
    refs.wsAuthTokenRef.current = 'token-v1';
    const baseArgs = {
      isAuthLoading: false,
      hasWsAuthToken: true,
      handleQueueEvent: vi.fn(),
      handleSessionEvent: vi.fn(),
      syncGate: createQueueSyncGate(),
      refs,
    };

    const { result, rerender } = renderHook((props) => useSessionLifecycle(props), { initialProps: baseArgs });

    act(() => {
      result.current.activateSession(activeSession('s1', 'kilter'));
    });
    expect(createControllerMock).toHaveBeenCalledTimes(1);

    // JWT rotates on a background refetch, but presence stays true — a healthy
    // authenticated socket must NOT be torn down.
    refs.wsAuthTokenRef.current = 'token-v2';
    rerender({ ...baseArgs, hasWsAuthToken: true });

    expect(controllers[0].stop).not.toHaveBeenCalled();
    expect(createControllerMock).toHaveBeenCalledTimes(1);
  });
});
