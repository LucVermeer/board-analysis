import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSearchParams, usePathname } from 'next/navigation';
import { v4 as uuidv4 } from 'uuid';
import { useLocaleRouter } from '@/app/lib/i18n/use-locale-router';
import { getBaseBoardPath } from '@/app/lib/url-utils';
import { saveSessionToHistory } from '@/app/lib/session-history-db';
import { getClimbSessionCookie, setClimbSessionCookie, clearClimbSessionCookie } from '@/app/lib/climb-session-cookie';
import { usePersistentSession } from '../../persistent-session';
import { useConnectionSettings } from '../../connection-manager/connection-settings-context';
import { emitSessionEnded } from '@/app/lib/session-lifecycle-tracking';
import type { ClimbQueueItem } from '../../queue-control/types';

type UseSessionIdManagementParams = {
  isOffBoardMode: boolean;
  propsBaseBoardPath?: string;
  currentQueue: ClimbQueueItem[];
  currentClimbQueueItem: ClimbQueueItem | null;
};

export function useSessionIdManagement({
  isOffBoardMode,
  propsBaseBoardPath,
  currentQueue,
  currentClimbQueueItem,
}: UseSessionIdManagementParams) {
  const searchParams = useSearchParams();
  const router = useLocaleRouter();
  const pathname = usePathname();
  const { backendUrl } = useConnectionSettings();
  const persistentSession = usePersistentSession();

  // Cookie reads (`document.cookie`) are non-reactive, so we mirror the board
  // route's session cookie in state. The start/join/migration/clear paths keep
  // it in sync; the derived `sessionId` below reads it. Off-board mode never
  // touches the cookie (the persistent IndexedDB session is authoritative), so
  // its mirror starts null.
  const [cookieSessionId, setCookieSessionId] = useState<string | null>(() =>
    isOffBoardMode ? null : getClimbSessionCookie(),
  );
  const persistentSessionId = persistentSession.activeSession?.sessionId ?? null;

  const baseBoardPath = useMemo(() => propsBaseBoardPath ?? getBaseBoardPath(pathname), [propsBaseBoardPath, pathname]);

  // Board path the persistent session belongs to (null when there's no session).
  const activeSessionBoardPath = persistentSession.activeSession?.boardPath
    ? getBaseBoardPath(persistentSession.activeSession.boardPath)
    : null;

  // The session id is now a pure DERIVATION of its three sources, no longer
  // reconciled by a local `useState` + two sync effects:
  //   - Off-board: the persistent (IndexedDB) session is the only authority.
  //   - Board route: adopt the persistent session's id ONLY when its board
  //     matches the route we're on, otherwise fall back to the cookie.
  //
  // The board-path match folds in both race windows the deleted sync effects
  // defended:
  //   * IndexedDB-load window — while `persistentSessionId` is briefly null
  //     before restore completes, the fallback keeps reading the cookie instead
  //     of wiping the id.
  //   * Multi-session restore — a session for board X held in IndexedDB while
  //     the user browses board Y must not leak X's id into board Y (which would
  //     flicker `isPersistentSessionActive` true on the wrong board); the match
  //     keeps board Y reading its own cookie.
  //
  // The match is intentionally strict: an active session with no `boardPath`
  // matches NOTHING (its `activeSessionBoardPath` is null), so every board route
  // falls back to its own cookie rather than adopting the boardless session.
  // A permissive `!activeSessionBoardPath` arm would re-open the multi-session
  // restore race the deleted sync effects guarded against.
  const boardMatchedPersistentSessionId =
    persistentSessionId && activeSessionBoardPath === baseBoardPath ? persistentSessionId : null;

  const sessionId = isOffBoardMode ? persistentSessionId : (boardMatchedPersistentSessionId ?? cookieSessionId);

  // Backward compat: migrate ?session= URL param to cookie and strip from URL
  useEffect(() => {
    if (isOffBoardMode) return;
    const sessionFromUrl = searchParams.get('session');
    if (sessionFromUrl) {
      setClimbSessionCookie(sessionFromUrl);
      setCookieSessionId(sessionFromUrl);
      const params = new URLSearchParams(searchParams.toString());
      params.delete('session');
      const queryString = params.toString();
      router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
    }
  }, [searchParams, isOffBoardMode, pathname, router]);

  // Clear the cookie mirror when the persistent session is deactivated
  // externally (e.g. the sesh-settings drawer's stop calling deactivateSession()
  // directly). We track the previous persistentSessionId so we only clear on an
  // active→inactive transition, not on the initial mount where persistentSessionId
  // starts null before IndexedDB loads. This is the ONE cookie-clear effect that
  // survives the derivation refactor.
  const prevPersistentSessionIdRef = useRef(persistentSessionId);
  useEffect(() => {
    const prev = prevPersistentSessionIdRef.current;
    prevPersistentSessionIdRef.current = persistentSessionId;

    if (prev && !persistentSessionId) {
      clearClimbSessionCookie();
      setCookieSessionId(null);
    }
  }, [persistentSessionId]);

  // Check if persistent session is active for this board
  const isPersistentSessionActive =
    persistentSession.activeSession?.sessionId === sessionId &&
    (persistentSession.activeSession?.boardPath ? getBaseBoardPath(persistentSession.activeSession.boardPath) : '') ===
      baseBoardPath;

  // Session management functions
  const startSession = useCallback(
    async (options?: { discoverable?: boolean; name?: string; sessionId?: string }) => {
      if (isOffBoardMode) throw new Error('Cannot start a session outside of a board route');
      if (!backendUrl) throw new Error('Backend URL not configured');

      const newSessionId = options?.sessionId || uuidv4();

      if (currentQueue.length > 0 || currentClimbQueueItem) {
        persistentSession.setInitialQueueForSession(newSessionId, currentQueue, currentClimbQueueItem, options?.name);
      }

      setClimbSessionCookie(newSessionId);
      setCookieSessionId(newSessionId);

      await saveSessionToHistory({
        id: newSessionId,
        name: options?.name || null,
        boardPath: pathname,
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
      });

      return newSessionId;
    },
    [backendUrl, pathname, currentQueue, currentClimbQueueItem, persistentSession, isOffBoardMode],
  );

  const joinSession = useCallback(
    async (sessionIdToJoin: string) => {
      if (isOffBoardMode) throw new Error('Cannot join a session outside of a board route');
      if (!backendUrl) throw new Error('Backend URL not configured');

      setClimbSessionCookie(sessionIdToJoin);
      setCookieSessionId(sessionIdToJoin);

      await saveSessionToHistory({
        id: sessionIdToJoin,
        name: null,
        boardPath: pathname,
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
      });
    },
    [backendUrl, pathname, isOffBoardMode],
  );

  // End the session for everyone (with a summary dialog). Routes through the
  // root `endSessionWithSummary`, which owns the single session-summary state +
  // dialog (persistent-session-wrapper.tsx) — no more board-route-local summary.
  // The `{ sessionId, boardType }` override preserves the board-route edge case:
  // the cookie can hold a session the persistent provider never activated (before
  // `BoardSessionBridge` runs), so we pass the cookie-derived id/board type
  // directly rather than relying on the (possibly still-null) active session.
  const endSession = useCallback(() => {
    const endingSessionId = sessionId;
    if (endingSessionId) emitSessionEnded(endingSessionId, 'user_left');
    // Eager clear. `endSessionWithSummary` below deactivates the persistent
    // session, which trips the `prevPersistentSessionIdRef` effect to clear the
    // cookie again — a harmless, idempotent double-clear.
    clearClimbSessionCookie();
    setCookieSessionId(null);
    const boardType =
      persistentSession.activeSession?.parsedParams?.board_name ?? baseBoardPath.split('/').filter(Boolean)[0] ?? null;
    persistentSession.endSessionWithSummary({ sessionId: endingSessionId, boardType });
  }, [persistentSession, sessionId, baseBoardPath]);

  return {
    sessionId,
    baseBoardPath,
    isPersistentSessionActive,
    persistentSession,
    backendUrl,
    searchParams,
    router,
    pathname,
    isOffBoardMode,
    startSession,
    joinSession,
    endSession,
  };
}
