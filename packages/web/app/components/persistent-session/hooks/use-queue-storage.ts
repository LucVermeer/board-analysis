import { useState, useCallback, useEffect, useRef, type MutableRefObject } from 'react';
import type { SessionSummary } from '@boardsesh/shared-schema';
import type { ClimbQueueItem as LocalClimbQueueItem } from '../../queue-control/types';
import type { BoardDetails } from '@/app/lib/types';
import { getPreference, removePreference } from '@/app/lib/user-preferences-db';
import { createGraphQLHttpClient } from '@/app/lib/graphql/client';
import { GET_SESSION_SUMMARY, type GetSessionSummaryResponse } from '@/app/lib/graphql/operations/sessions';
import { type ActiveSessionInfo, ACTIVE_SESSION_KEY, DEBUG } from '../types';

type UseQueueStorageArgs = {
  activeSession: ActiveSessionInfo | null;
  setActiveSession: (val: ActiveSessionInfo | null) => void;
  /** Called when a restored session was already auto-finished by the backend */
  onSessionAutoFinished: (summary: SessionSummary, boardType: string | null) => void;
  wsAuthTokenRef: MutableRefObject<string | null>;
};

export type QueueStorageState = {
  localQueue: LocalClimbQueueItem[];
  localCurrentClimbQueueItem: LocalClimbQueueItem | null;
  localBoardPath: string | null;
  localBoardDetails: BoardDetails | null;
  isLocalQueueLoaded: boolean;
};

export type QueueStorageActions = {
  setLocalQueueState: (
    queue: LocalClimbQueueItem[],
    currentItem: LocalClimbQueueItem | null,
    boardPath: string,
    boardDetails: BoardDetails,
  ) => void;
  clearLocalQueue: () => void;
};

export function useQueueStorage({
  activeSession,
  setActiveSession,
  onSessionAutoFinished,
  wsAuthTokenRef,
}: UseQueueStorageArgs): QueueStorageState & QueueStorageActions {
  const [localQueue, setLocalQueue] = useState<LocalClimbQueueItem[]>([]);
  const [localCurrentClimbQueueItem, setLocalCurrentClimbQueueItem] = useState<LocalClimbQueueItem | null>(null);
  const [localBoardPath, setLocalBoardPath] = useState<string | null>(null);
  const [localBoardDetails, setLocalBoardDetails] = useState<BoardDetails | null>(null);
  const [isLocalQueueLoaded, setIsLocalQueueLoaded] = useState(false);

  // Ref for activeSession so callbacks have stable identity
  const activeSessionRef = useRef(activeSession);
  activeSessionRef.current = activeSession;

  // One-time cleanup: delete the old IndexedDB queue database if it exists
  useEffect(() => {
    if (typeof window !== 'undefined' && window.indexedDB) {
      window.indexedDB.deleteDatabase('boardsesh-queue');
    }
  }, []);

  // Auto-restore session state on mount (party session only — local queues are no longer persisted)
  useEffect(() => {
    async function restoreState() {
      // Try to restore party session
      try {
        const persisted = await getPreference<ActiveSessionInfo>(ACTIVE_SESSION_KEY);
        if (persisted && persisted.sessionId && persisted.boardPath && persisted.boardDetails) {
          if (DEBUG) console.info('[PersistentSession] Restoring persisted session:', persisted.sessionId);

          // Pre-flight: check if the session was auto-finished while the app was closed.
          // The backend marks sessions as ended after 1h of inactivity (see RoomManager
          // inactivity sweep). When that happened we surface the summary instead of
          // re-joining a dead session.
          const autoFinishedHandled = await maybeHandleAutoFinishedSession(
            persisted,
            wsAuthTokenRef.current,
            onSessionAutoFinished,
          );
          if (autoFinishedHandled) {
            setIsLocalQueueLoaded(true);
            return;
          }

          setActiveSession(persisted);
          setIsLocalQueueLoaded(true);
          return;
        }
      } catch (error) {
        console.error('[PersistentSession] Failed to restore persisted session:', error);
      }

      setIsLocalQueueLoaded(true);
    }

    void restoreState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only on mount

  // Local queue management (in-memory only)
  const setLocalQueueState = useCallback(
    (
      newQueue: LocalClimbQueueItem[],
      newCurrentItem: LocalClimbQueueItem | null,
      boardPath: string,
      boardDetails: BoardDetails,
    ) => {
      // Don't store local queue if party mode is active
      if (activeSessionRef.current) return;

      setLocalQueue(newQueue);
      setLocalCurrentClimbQueueItem(newCurrentItem);
      setLocalBoardPath(boardPath);
      setLocalBoardDetails(boardDetails);
    },
    [],
  );

  const clearLocalQueue = useCallback(() => {
    if (DEBUG) console.info('[PersistentSession] Clearing local queue');
    setLocalQueue([]);
    setLocalCurrentClimbQueueItem(null);
    setLocalBoardPath(null);
    setLocalBoardDetails(null);
  }, []);

  return {
    localQueue,
    localCurrentClimbQueueItem,
    localBoardPath,
    localBoardDetails,
    isLocalQueueLoaded,
    setLocalQueueState,
    clearLocalQueue,
  };
}

/**
 * Returns true if the persisted session was already auto-finished by the
 * backend. In that case the persisted entry is cleared and the caller-provided
 * callback is invoked to open the finished-session dialog. Returns false when
 * the session is still active (or its state is unknown) and should be activated
 * normally — the existing join/reconnect path will handle "session gone" the
 * same way it always has.
 *
 * Detection key: `summary.endedAt` is set (the backend's inactivity sweep
 * stamps `ended_at` when it auto-ends a session). A null summary is ambiguous
 * (a fresh session with no ticks looks the same as a missing session) so we
 * fall through rather than silently clearing.
 */
async function maybeHandleAutoFinishedSession(
  persisted: ActiveSessionInfo,
  authToken: string | null,
  onSessionAutoFinished: (summary: SessionSummary, boardType: string | null) => void,
): Promise<boolean> {
  if (!authToken) return false;
  try {
    const httpClient = createGraphQLHttpClient(authToken);
    const response = await httpClient.request<GetSessionSummaryResponse>(GET_SESSION_SUMMARY, {
      sessionId: persisted.sessionId,
    });
    const summary = response?.sessionSummary ?? null;
    if (summary?.endedAt) {
      if (DEBUG) console.info('[PersistentSession] Session was auto-finished, showing summary');
      await removePreference(ACTIVE_SESSION_KEY);
      onSessionAutoFinished(summary, persisted.parsedParams?.board_name ?? null);
      return true;
    }
    return false;
  } catch (error) {
    if (DEBUG) console.warn('[PersistentSession] Auto-finished pre-check failed, falling through:', error);
    return false;
  }
}
