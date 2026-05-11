import { useState, useCallback, useEffect, useRef } from 'react';
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
  wsAuthToken: string | null;
  isAuthLoading: boolean;
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
  wsAuthToken,
  isAuthLoading,
}: UseQueueStorageArgs): QueueStorageState & QueueStorageActions {
  const [localQueue, setLocalQueue] = useState<LocalClimbQueueItem[]>([]);
  const [localCurrentClimbQueueItem, setLocalCurrentClimbQueueItem] = useState<LocalClimbQueueItem | null>(null);
  const [localBoardPath, setLocalBoardPath] = useState<string | null>(null);
  const [localBoardDetails, setLocalBoardDetails] = useState<BoardDetails | null>(null);
  const [isLocalQueueLoaded, setIsLocalQueueLoaded] = useState(false);
  const hasRestoredRef = useRef(false);

  // Ref for activeSession so callbacks have stable identity
  const activeSessionRef = useRef(activeSession);
  activeSessionRef.current = activeSession;

  // One-time cleanup: delete the old IndexedDB queue database if it exists
  useEffect(() => {
    if (typeof window !== 'undefined' && window.indexedDB) {
      window.indexedDB.deleteDatabase('boardsesh-queue');
    }
  }, []);

  // Restore party session once auth has resolved. Waiting for !isAuthLoading
  // ensures the pre-flight auto-finished check has a real token to send —
  // otherwise it short-circuits on the `!authToken` guard and the finished
  // dialog never appears on a cold start.
  useEffect(() => {
    if (isAuthLoading) return;
    if (hasRestoredRef.current) return;
    hasRestoredRef.current = true;

    async function restoreState() {
      try {
        const persisted = await getPreference<ActiveSessionInfo>(ACTIVE_SESSION_KEY);
        if (persisted && persisted.sessionId && persisted.boardPath && persisted.boardDetails) {
          if (DEBUG) console.info('[PersistentSession] Restoring persisted session:', persisted.sessionId);

          const autoFinished = await fetchAutoFinishedSummary(persisted, wsAuthToken);
          if (autoFinished) {
            if (DEBUG) console.info('[PersistentSession] Session was auto-finished, showing summary');
            await removePreference(ACTIVE_SESSION_KEY);
            onSessionAutoFinished(autoFinished.summary, autoFinished.boardType);
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
    // `wsAuthToken` is intentionally not in the deps: restoration is gated by
    // `isAuthLoading` and runs once (guarded by hasRestoredRef). When this
    // effect re-runs because isAuthLoading flipped, the new closure captures
    // the freshly-resolved token. Token rotation after that should not
    // re-restore.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthLoading, onSessionAutoFinished, setActiveSession]);

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

// Null summary is ambiguous (fresh session with no ticks vs. missing) so we treat it as "still active".
export async function fetchAutoFinishedSummary(
  persisted: ActiveSessionInfo,
  authToken: string | null,
): Promise<{ summary: SessionSummary; boardType: string | null } | null> {
  if (!authToken) return null;
  try {
    const httpClient = createGraphQLHttpClient(authToken);
    const response = await httpClient.request<GetSessionSummaryResponse>(GET_SESSION_SUMMARY, {
      sessionId: persisted.sessionId,
    });
    const summary = response?.sessionSummary ?? null;
    if (summary?.endedAt) {
      return { summary, boardType: persisted.parsedParams?.board_name ?? null };
    }
    return null;
  } catch (error) {
    if (DEBUG) console.warn('[PersistentSession] Auto-finished pre-check failed, falling through:', error);
    return null;
  }
}
