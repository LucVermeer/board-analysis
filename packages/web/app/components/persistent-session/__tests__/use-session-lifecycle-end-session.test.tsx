import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { MutableRefObject } from 'react';
import type { SessionSummary } from '@boardsesh/shared-schema';
import { createQueueSyncGate } from '@boardsesh/queue-runtime';
import { END_SESSION } from '@boardsesh/graphql/operations/sessions';
import { useSessionLifecycle } from '../hooks/use-session-lifecycle';
import type { ActiveSessionInfo, Session } from '../types';
import type { ClimbQueueItem as LocalClimbQueueItem } from '../../queue-control/types';

// The END_SESSION mutation goes over the HTTP GraphQL client. Mock the client so
// `endSessionWithSummary` never hits the network and we can assert what it sent.
const { requestMock } = vi.hoisted(() => ({ requestMock: vi.fn() }));
vi.mock('@/app/lib/graphql/client', () => ({
  createGraphQLHttpClient: vi.fn(() => ({ request: requestMock })),
}));

function activeSession(sessionId: string, boardName: string): ActiveSessionInfo {
  return {
    sessionId,
    boardPath: `/${boardName}/1/10/1,2/40/list`,
    boardDetails: { board_name: boardName } as unknown as ActiveSessionInfo['boardDetails'],
    parsedParams: { board_name: boardName } as unknown as ActiveSessionInfo['parsedParams'],
  };
}

// Builds the hook args with a set auth token (the override path only fires the
// mutation when a token is present). Returns the refs so a test can plant a
// DIFFERENT active session before ending the override one.
function buildArgs() {
  const refs = {
    wsAuthTokenRef: { current: 'test-token' } as MutableRefObject<string | null>,
    usernameRef: { current: undefined } as MutableRefObject<string | undefined>,
    avatarUrlRef: { current: undefined } as MutableRefObject<string | undefined>,
    sessionRef: { current: null } as MutableRefObject<Session | null>,
    activeSessionRef: { current: null } as MutableRefObject<ActiveSessionInfo | null>,
    queueRef: { current: [] } as MutableRefObject<LocalClimbQueueItem[]>,
    currentClimbQueueItemRef: { current: null } as MutableRefObject<LocalClimbQueueItem | null>,
    triggerResyncRef: { current: null } as MutableRefObject<(() => void) | null>,
    lastReceivedSequenceRef: { current: null } as MutableRefObject<number | null>,
  };
  const args = {
    isAuthLoading: false,
    hasWsAuthToken: true,
    handleQueueEvent: vi.fn(),
    handleSessionEvent: vi.fn(),
    syncGate: createQueueSyncGate(),
    refs,
  };
  return { args, refs };
}

describe('useSessionLifecycle — endSessionWithSummary override path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ends the override session, not the active one, when a different session is active', async () => {
    const summary = { sessionId: 'override-session' } as unknown as SessionSummary;
    requestMock.mockResolvedValueOnce({ endSession: summary });

    const { args, refs } = buildArgs();
    const { result } = renderHook(() => useSessionLifecycle(args));

    // A DIFFERENT session is active (e.g. a tension party the provider connected
    // to), but the caller ends a kilter session held only in the cookie.
    refs.activeSessionRef.current = activeSession('active-session', 'tension');

    act(() => {
      result.current.endSessionWithSummary({ sessionId: 'override-session', boardType: 'kilter' });
    });

    await waitFor(() => expect(result.current.sessionSummary).toBe(summary));

    // The END_SESSION mutation targeted the OVERRIDE id, not the active one.
    expect(requestMock).toHaveBeenCalledTimes(1);
    expect(requestMock).toHaveBeenCalledWith(END_SESSION, expect.objectContaining({ sessionId: 'override-session' }));
    // The summary surfaces for the override's board type, not the active session's.
    expect(result.current.sessionSummaryBoardType).toBe('kilter');
    expect(result.current.sessionSummaryAutoFinished).toBe(false);
  });

  it('ends the override session when no session was ever activated (board-route cookie case)', async () => {
    const summary = { sessionId: 'cookie-session' } as unknown as SessionSummary;
    requestMock.mockResolvedValueOnce({ endSession: summary });

    const { args, refs } = buildArgs();
    const { result } = renderHook(() => useSessionLifecycle(args));

    // The provider never activated this session, so the active-session ref is null.
    expect(refs.activeSessionRef.current).toBeNull();

    act(() => {
      result.current.endSessionWithSummary({ sessionId: 'cookie-session', boardType: 'kilter' });
    });

    await waitFor(() => expect(result.current.sessionSummary).toBe(summary));

    expect(requestMock).toHaveBeenCalledWith(END_SESSION, expect.objectContaining({ sessionId: 'cookie-session' }));
    expect(result.current.sessionSummaryBoardType).toBe('kilter');
  });
});
