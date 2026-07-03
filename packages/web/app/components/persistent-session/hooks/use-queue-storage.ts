import { useState, useCallback, useEffect, useRef } from 'react';
import type { SessionSummary } from '@boardsesh/shared-schema';
import type { QueueAction, QueueSearchParams } from '@boardsesh/queue';
import type { BoardDetails } from '@/app/lib/types';
import { getPreference, removePreference } from '@/app/lib/user-preferences-db';
import { getBaseBoardPath } from '@/app/lib/url-utils';
import { createGraphQLHttpClient } from '@/app/lib/graphql/client';
import { GET_SESSION_SUMMARY, type GetSessionSummaryResponse } from '@boardsesh/graphql/operations/sessions';
import { getClimbSessionCookie } from '@/app/lib/climb-session-cookie';
import { type ActiveSessionInfo, ACTIVE_SESSION_KEY, DEBUG } from '../types';

type UseQueueStorageArgs = {
  activeSession: ActiveSessionInfo | null;
  setActiveSession: (val: ActiveSessionInfo) => void;
  /** Called when a restored session was already auto-finished by the backend */
  onSessionAutoFinished?: (summary: SessionSummary, boardType: string | null) => void;
  wsAuthToken?: string | null;
  isAuthLoading?: boolean;
  /**
   * The root reducer's dispatch. `setBoardContext` fires `CLEAR_QUEUE` here
   * when the incoming board differs from the board the current (root-owned)
   * queue belongs to — see `setBoardContext` doc below.
   */
  dispatch: (action: QueueAction<QueueSearchParams>) => void;
};

export type QueueStorageState = {
  soloBoardPath: string | null;
  soloBoardDetails: BoardDetails | null;
  /**
   * True once the mount-time auth pre-flight has finished (a real token ran the
   * auto-finished check, or there was no persisted session / no token to try).
   * Despite the name it does NOT mean a board context is loaded — a solo user
   * with no board still flips this true; it just gates the UI on "session
   * restore has been decided" so the queue isn't blocked waiting on it.
   */
  isBoardContextLoaded: boolean;
};

export type QueueStorageActions = {
  setBoardContext: (boardPath: string, boardDetails: BoardDetails) => void;
};

export function useQueueStorage({
  activeSession,
  setActiveSession,
  onSessionAutoFinished = () => {},
  wsAuthToken = null,
  isAuthLoading = false,
  dispatch,
}: UseQueueStorageArgs): QueueStorageState & QueueStorageActions {
  const [soloBoardPath, setSoloBoardPath] = useState<string | null>(null);
  const [soloBoardDetails, setSoloBoardDetails] = useState<BoardDetails | null>(null);
  const [isBoardContextLoaded, setIsBoardContextLoaded] = useState(false);
  // Flips true only after we ran the auto-finished pre-flight with a real
  // token (or determined there was no persisted session at all). The no-token
  // branch deliberately leaves this false so a later non-null `wsAuthToken`
  // re-fires the effect and gets its chance at the pre-flight.
  const hasRunPreflightRef = useRef(false);
  // Flips true the first time we successfully read the persisted session and
  // committed it to `activeSession`. Prevents double-activation on the
  // re-fire after `wsAuthToken` arrives.
  const hasActivatedRef = useRef(false);

  // Ref for activeSession so callbacks have stable identity
  const activeSessionRef = useRef(activeSession);
  activeSessionRef.current = activeSession;

  // Adopt the ended session's board as the solo board context when a party
  // ends. `setBoardContext` no-ops for the duration of a party, so without this
  // `soloBoardPath` still points at whatever board preceded the party. After
  // the party ends the root queue holds the party board's queue, and the next
  // navigation's board-mismatch check in `setBoardContext` would see
  // previous=pre-party-board ≠ current-board and CLEAR_QUEUE the queue the user
  // is still climbing on. Stamping the ended session's board here keeps the
  // carried queue (board-route parity) and keeps solo board details coherent
  // with it off-board.
  const previousActiveSessionRef = useRef<ActiveSessionInfo | null>(null);

  // Detect the party-end transition during RENDER, not only in the effect
  // below. The effect's `setSoloBoardPath` lands asynchronously, but a board
  // route's injector can call `setBoardContext(base path)` in the SAME commit
  // that `activeSession` flips to null — and its layout effect runs BEFORE this
  // provider's passive adoption effect. If that concurrent `setBoardContext`
  // read the stale pre-party `soloBoardPath` it would see previous ≠ new-board
  // and CLEAR_QUEUE the just-carried queue. Computing the adoption here and
  // stamping the adopted board into `boardContextRef.current` below closes that
  // window: a same-board inject during the transition is seen as a no-op change.
  //
  // Normalize to the BASE path: a session's `boardPath` is the full pathname
  // (angle + /view|/list), but every `setBoardContext` caller (the injector,
  // cold-start) passes a base path and the board-change guard compares base
  // paths. Stamping the raw full path would never match the injector's base
  // path, so the guard would clear anyway. `previousActiveSessionRef.current`
  // still holds the pre-transition session here (the effect overwrites it only
  // after this render commits), so this reads the same transition the effect does.
  const pendingAdoption = resolveEndedSessionBoardAdoption(previousActiveSessionRef.current, activeSession);
  const adoptedBoardPath = pendingAdoption ? getBaseBoardPath(pendingAdoption.boardPath) : null;

  // Ref for the board-context fields + dispatch so `setBoardContext` stays a
  // stable `[]`-deps callback while reading fresh values. When a party is
  // ending this render, prefer the adopted (base) board so a same-commit
  // injector's `setBoardContext` sees it instead of the stale pre-party path.
  const boardContextRef = useRef({ soloBoardPath, dispatch });
  boardContextRef.current = { soloBoardPath: adoptedBoardPath ?? soloBoardPath, dispatch };

  // Commit the adopted board to state so it survives future renders and other
  // consumers (soloBoardDetails, the bridge adapter's base board path) stay
  // coherent. Base-normalized to match the render-time stamp above.
  useEffect(() => {
    const previous = previousActiveSessionRef.current;
    previousActiveSessionRef.current = activeSession;
    const adoption = resolveEndedSessionBoardAdoption(previous, activeSession);
    if (adoption) {
      setSoloBoardPath(getBaseBoardPath(adoption.boardPath));
      setSoloBoardDetails(adoption.boardDetails);
    }
  }, [activeSession]);

  // One-time cleanup: delete the old IndexedDB queue database if it exists
  useEffect(() => {
    if (typeof window !== 'undefined' && window.indexedDB) {
      window.indexedDB.deleteDatabase('boardsesh-queue');
    }
  }, []);

  // Restore party session once auth has resolved.
  //
  // The pre-flight auto-finished check needs a real bearer token —
  // `fetchAutoFinishedSummary` short-circuits on `!authToken`. Two valid
  // post-`isAuthLoading=false` states matter here:
  //   - authenticated (or sign-in arrived later): wsAuthToken is a string;
  //     run the pre-flight, surface the summary if the backend ended the
  //     session, then mark the pre-flight done.
  //   - anonymous or auth-fetch error: wsAuthToken stays null; restore the
  //     UI optimistically so the queue isn't blocked, but DO NOT mark the
  //     pre-flight done — a later non-null wsAuthToken (e.g. user signs in
  //     after the page loads) re-fires this effect and gets a real chance.
  //
  // The diagnostic log on the no-token branch is unconditional so a
  // silent fall-through (e.g. token fetch repeatedly fails) is visible.
  useEffect(() => {
    if (isAuthLoading) return;
    if (hasRunPreflightRef.current) return;

    async function restoreState() {
      try {
        const persisted = await getPreference<ActiveSessionInfo>(ACTIVE_SESSION_KEY);
        if (persisted && persisted.sessionId && persisted.boardPath && persisted.boardDetails) {
          // Cookie wins over stale IndexedDB — skip activation and let BoardSessionBridge activate the cookie's session. Leave IndexedDB intact so an unvalidated cookie (e.g. legacy ?session= migration) can't wipe a recoverable entry.
          const cookieSessionId = getClimbSessionCookie();
          if (cookieSessionId && cookieSessionId !== persisted.sessionId) {
            if (DEBUG)
              console.info('[PersistentSession] Cookie session differs from persisted; skipping restore.', {
                cookieSessionId,
                persistedSessionId: persisted.sessionId,
              });
            hasRunPreflightRef.current = true;
            setIsBoardContextLoaded(true);
            return;
          }

          if (DEBUG) console.info('[PersistentSession] Restoring persisted session:', persisted.sessionId);

          if (!wsAuthToken) {
            console.info(
              '[PersistentSession] No auth token after auth resolved; restoring optimistically. Will retry the auto-finished pre-flight if a token arrives.',
            );
            if (!hasActivatedRef.current) {
              hasActivatedRef.current = true;
              setActiveSession(persisted);
            }
            setIsBoardContextLoaded(true);
            return;
          }

          const autoFinished = await fetchAutoFinishedSummary(persisted, wsAuthToken);
          hasRunPreflightRef.current = true;
          if (autoFinished) {
            if (DEBUG) console.info('[PersistentSession] Session was auto-finished, showing summary');
            await removePreference(ACTIVE_SESSION_KEY);
            onSessionAutoFinished(autoFinished.summary, autoFinished.boardType);
            setIsBoardContextLoaded(true);
            return;
          }

          if (!hasActivatedRef.current) {
            hasActivatedRef.current = true;
            setActiveSession(persisted);
          }
          setIsBoardContextLoaded(true);
          return;
        }
      } catch (error) {
        console.error('[PersistentSession] Failed to restore persisted session:', error);
      }

      // No persisted session, or read failed — nothing the token would change.
      hasRunPreflightRef.current = true;
      setIsBoardContextLoaded(true);
    }

    void restoreState();
  }, [isAuthLoading, wsAuthToken, onSessionAutoFinished, setActiveSession]);

  // Board-context bookkeeping (in-memory only). Replaces the old
  // `setLocalQueueState`/`clearLocalQueue` pair now that the queue itself
  // lives in the root reducer instead of a separate local-state copy.
  //
  // Absorbs the board-config-change clear effect that used to live in the
  // board route's `use-queue-restoration.ts`: that hook reactively compared
  // its route's `baseBoardPath` against `ps.localBoardPath` and cleared the
  // stale local queue on a mismatch. Since the queue is now single-owned at
  // the root, the same decision has to happen HERE, before overwriting the
  // board-context fields — otherwise a solo queue built on board A would
  // silently keep showing (and accepting adds into) board B's queue after
  // navigating directly from A's route to B's.
  const setBoardContext = useCallback((boardPath: string, boardDetails: BoardDetails) => {
    // Don't touch board context if party mode is active — mirrors the old
    // `setLocalQueueState` guard (party queue state is server-owned).
    if (activeSessionRef.current) return;

    const { soloBoardPath: previousBoardPath, dispatch: dispatchToRoot } = boardContextRef.current;
    if (previousBoardPath && previousBoardPath !== boardPath) {
      if (DEBUG)
        console.info('[PersistentSession] Board context changed, clearing solo queue', {
          from: previousBoardPath,
          to: boardPath,
        });
      dispatchToRoot({ type: 'CLEAR_QUEUE' });
    }

    setSoloBoardPath(boardPath);
    setSoloBoardDetails(boardDetails);
  }, []);

  return {
    soloBoardPath,
    soloBoardDetails,
    isBoardContextLoaded,
    setBoardContext,
  };
}

// Pure transition predicate for the party-end board adoption above. Returns the
// board to stamp as the solo context when a party ends (previous session
// present, current gone, and the ended session carried a board), or null for
// every other transition (activation, session→session swap, no-op). Extracted
// so the transition is unit-testable without the hook's IndexedDB/GraphQL deps.
// Returns the session's RAW `boardPath` (full pathname); the hook base-normalizes
// it via `getBaseBoardPath` before stamping, since `soloBoardPath` is a base path.
export function resolveEndedSessionBoardAdoption(
  previous: ActiveSessionInfo | null,
  current: ActiveSessionInfo | null,
): { boardPath: string; boardDetails: BoardDetails } | null {
  if (previous && !current && previous.boardPath && previous.boardDetails) {
    return { boardPath: previous.boardPath, boardDetails: previous.boardDetails };
  }
  return null;
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
