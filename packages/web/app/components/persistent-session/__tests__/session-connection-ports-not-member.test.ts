import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';
import type { MutableRefObject } from 'react';
import { GraphQLOperationError } from '@boardsesh/graphql-client';
import { createQueueSyncGate } from '@boardsesh/queue-runtime';
import type { ActiveSessionInfo } from '../types';
import type { ClimbQueueItem as LocalClimbQueueItem } from '../../queue-control/types';

// The onError NOT_SESSION_MEMBER branch clears the persisted session id via
// removePreference — mock it so the test can assert the clear without IndexedDB.
const removePreferenceMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));
vi.mock('@/app/lib/user-preferences-db', () => ({ removePreference: removePreferenceMock }));

import { createWebSessionConnectionDeps } from '../hooks/session-connection-ports';

function buildArgs() {
  const setActiveSession = vi.fn();
  const setError = vi.fn();
  const setIsConnecting = vi.fn();
  const args = {
    activeSession: {
      sessionId: 's1',
      boardPath: '/kilter/1/10/1,2/40/list',
      boardDetails: { board_name: 'kilter' } as unknown as ActiveSessionInfo['boardDetails'],
      parsedParams: { board_name: 'kilter' } as unknown as ActiveSessionInfo['parsedParams'],
    } as ActiveSessionInfo,
    backendUrl: 'ws://localhost:8080/graphql',
    syncGate: createQueueSyncGate(),
    refs: {
      wsAuthTokenRef: { current: null } as MutableRefObject<string | null>,
      usernameRef: { current: undefined } as MutableRefObject<string | undefined>,
      avatarUrlRef: { current: undefined } as MutableRefObject<string | undefined>,
      queueRef: { current: [] } as MutableRefObject<LocalClimbQueueItem[]>,
      currentClimbQueueItemRef: { current: null } as MutableRefObject<LocalClimbQueueItem | null>,
    },
    pendingInitialQueueRef: { current: null },
    handleQueueEvent: vi.fn(),
    handleSessionEvent: vi.fn(),
    setActiveSession,
    setClient: vi.fn(),
    setSession: vi.fn(),
    setIsConnecting,
    setError,
    setHasConnected: vi.fn(),
  };
  return { args, setActiveSession, setError, setIsConnecting };
}

describe('createWebSessionConnectionDeps — onError NOT_SESSION_MEMBER handling (#2385 follow-up)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('force-clears the persisted + active session on a NOT_SESSION_MEMBER error, without the generic error path', () => {
    const { args, setActiveSession, setError, setIsConnecting } = buildArgs();
    const deps = createWebSessionConnectionDeps(args);

    deps.onError(
      new GraphQLOperationError([
        {
          message: 'Unauthorized: not in any session',
          extensions: { code: 'NOT_SESSION_MEMBER', reason: 'no-session-id' },
        },
      ]),
    );

    expect(removePreferenceMock).toHaveBeenCalledTimes(1);
    expect(setActiveSession).toHaveBeenCalledWith(null);
    // The generic error path (which would keep the session and surface an error)
    // must not run.
    expect(setError).not.toHaveBeenCalled();
    expect(setIsConnecting).not.toHaveBeenCalled();
  });

  it('routes a generic connection error to setError and does not clear the session', () => {
    const { args, setActiveSession, setError, setIsConnecting } = buildArgs();
    const deps = createWebSessionConnectionDeps(args);

    const genericError = new Error('WebSocket closed');
    deps.onError(genericError);

    expect(setActiveSession).not.toHaveBeenCalled();
    expect(removePreferenceMock).not.toHaveBeenCalled();
    expect(setError).toHaveBeenCalledWith(genericError);
    expect(setIsConnecting).toHaveBeenCalledWith(false);
  });

  it('does not clear on a different coded error (e.g. RATE_LIMITED)', () => {
    const { args, setActiveSession, setError } = buildArgs();
    const deps = createWebSessionConnectionDeps(args);

    deps.onError(
      new GraphQLOperationError([{ message: 'slow down', extensions: { code: 'RATE_LIMITED', retryAfterSeconds: 5 } }]),
    );

    expect(setActiveSession).not.toHaveBeenCalled();
    expect(removePreferenceMock).not.toHaveBeenCalled();
    expect(setError).toHaveBeenCalledTimes(1);
  });
});
