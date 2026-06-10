// Renderer-agnostic React hook over the pure board-presence reducer.
//
// Binds a `BoardPresenceClient` (injected transport) to
// `boardPresenceReducer`, exposing the wall's "now playing" state plus actions
// for reporting a fresh climb and reading the captured undo target. All platform
// I/O is injected — this package imports no GraphQL client and no host
// components, so it runs unchanged on web and mobile.
//
// Catch-up ordering (the load-bearing bit): on a new board we SUBSCRIBE FIRST,
// so any live event that lands during the async backfill is already buffered
// into the reducer; only then do we fetch recent climbs and dispatch
// BACKFILL_HISTORY. The reducer's per-board `seq` dedup makes that safe — a
// stale backfill can't clobber a newer live `current` (see board-presence
// reducer). We also guard every async result against unmount and against a
// board switch (late results for a previous board are ignored).

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  boardPresenceReducer,
  initialBoardPresenceState,
  mapBoardPresenceEnvelopeToAction,
  type BoardPresenceState,
} from '@boardsesh/board-presence';
import type { BoardPresenceClimb, BoardPresenceStats, ClimbQueueItemInput } from '@boardsesh/shared-schema';
import type { BoardPresenceClient } from './types';

export type UseBoardPresenceResult = {
  currentClimb: BoardPresenceCurrentState['currentClimb'];
  previousClimb: BoardPresenceCurrentState['previousClimb'];
  undoTarget: BoardPresenceCurrentState['undoTarget'];
  history: BoardPresenceFeedState['history'];
  stats: BoardPresenceFeedState['stats'];
  isLive: BoardPresenceCurrentState['isLive'];
  reportClimb: BoardPresenceActions['reportClimb'];
  reportClimbWithUndoTarget: BoardPresenceActions['reportClimbWithUndoTarget'];
  getUndoTarget: BoardPresenceActions['getUndoTarget'];
};

export type BoardPresenceReportResult = {
  accepted: boolean;
  undoTarget: BoardPresenceClimb | null;
};

export type BoardPresenceCurrentState = {
  currentClimb: BoardPresenceState['currentClimb'];
  previousClimb: BoardPresenceState['previousClimb'];
  /**
   * The wall climb that should be restored for this device's latest accepted
   * report. Platforms should relight this over BLE, then report the restored
   * climb after the BLE write succeeds.
   */
  undoTarget: BoardPresenceClimb | null;
  /** True while a live subscription is attached for the active board. */
  isLive: boolean;
};

export type BoardPresenceFeedState = {
  history: BoardPresenceState['history'];
  stats: BoardPresenceStats | null;
};

export type BoardPresenceActions = {
  /** Report a freshly-lit climb to the active board. Resolves to the accepted flag. */
  reportClimb: (climb: ClimbQueueItemInput, angle: number | null) => Promise<boolean>;
  /**
   * Report a freshly-lit climb and return the locally captured undo target for
   * this report. Use this in platform snackbar flows so the button restores the
   * exact climb that was current before the report, even if the live echo has
   * not round-tripped yet.
   */
  reportClimbWithUndoTarget: (climb: ClimbQueueItemInput, angle: number | null) => Promise<BoardPresenceReportResult>;
  /** Latest captured undo target for action-only consumers that need a ref-like read. */
  getUndoTarget: () => BoardPresenceClimb | null;
};

export function useBoardPresence(boardId: number | null, client: BoardPresenceClient | null): UseBoardPresenceResult {
  const [state, dispatch] = useReducer(boardPresenceReducer, initialBoardPresenceState);
  const [stats, setStats] = useState<BoardPresenceStats | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [undoTarget, setUndoTarget] = useState<BoardPresenceClimb | null>(null);

  // Live refs so the action callbacks stay identity-stable while still reading
  // the current board, client, and restore target.
  const boardIdRef = useRef(boardId);
  boardIdRef.current = boardId;
  const clientRef = useRef(client);
  clientRef.current = client;
  const currentClimbRef = useRef<BoardPresenceClimb | null>(state.currentClimb);
  currentClimbRef.current = state.currentClimb;
  const undoTargetRef = useRef<BoardPresenceClimb | null>(undoTarget);
  undoTargetRef.current = undoTarget;

  useEffect(() => {
    // No board or no transport: collapse to the initial state and stay inert.
    if (boardId === null || client === null) {
      dispatch({ type: 'RESET' });
      setStats(null);
      setIsLive(false);
      setUndoTarget(null);
      return;
    }

    // Reset for the board we're about to attach to, so the prior board's
    // history/current never bleeds into this one.
    dispatch({ type: 'RESET' });
    setStats(null);
    setUndoTarget(null);

    let isActive = true;
    // Identifies this effect run; late async results for a superseded board are
    // ignored by comparing against the ref, which the cleanup flips off.
    const subscribedBoardId = boardId;

    // 1) Subscribe FIRST. Events arriving during the catch-up fetches below are
    //    buffered straight into the reducer; the reducer's seq-dedup then keeps
    //    a stale backfill from clobbering a newer live current.
    const unsubscribe = client.subscribeNowPlaying(
      boardId,
      (event) => {
        if (!isActive) {
          return;
        }
        const action = mapBoardPresenceEnvelopeToAction(event);
        if (action) {
          dispatch(action);
        }
      },
      () => {
        if (isActive) {
          setIsLive(false);
        }
      },
      () => {
        if (isActive) {
          setIsLive(false);
        }
      },
    );
    setIsLive(true);

    // 2) Backfill recent history, then 3) fetch stats. Both guarded against
    //    unmount and against a board switch (a late resolve for the previous
    //    board must not write into the new board's state).
    void client
      .fetchRecentClimbs(boardId)
      .then((recentClimbs) => {
        if (isActive && boardIdRef.current === subscribedBoardId) {
          dispatch({ type: 'BACKFILL_HISTORY', payload: recentClimbs });
        }
      })
      .catch(() => {
        // Backfill is best-effort; the live stream still drives the wall.
      });

    void client
      .fetchStats(boardId)
      .then((nextStats) => {
        if (isActive && boardIdRef.current === subscribedBoardId) {
          setStats(nextStats);
        }
      })
      .catch(() => {
        // Stats are best-effort; absence renders as "no stats yet".
      });

    return () => {
      isActive = false;
      setIsLive(false);
      unsubscribe();
    };
  }, [boardId, client]);

  const reportClimbWithUndoTarget = useCallback(
    async (climb: ClimbQueueItemInput, angle: number | null): Promise<BoardPresenceReportResult> => {
      const activeBoardId = boardIdRef.current;
      const activeClient = clientRef.current;
      if (activeBoardId === null || activeClient === null) {
        return { accepted: false, undoTarget: null };
      }

      const capturedUndoTarget = currentClimbRef.current;
      const accepted = await activeClient.reportClimb(activeBoardId, climb, angle);
      if (!accepted) {
        return { accepted: false, undoTarget: null };
      }

      undoTargetRef.current = capturedUndoTarget;
      setUndoTarget(capturedUndoTarget);
      return { accepted: true, undoTarget: capturedUndoTarget };
    },
    [],
  );

  const reportClimb = useCallback(
    async (climb: ClimbQueueItemInput, angle: number | null): Promise<boolean> => {
      const result = await reportClimbWithUndoTarget(climb, angle);
      return result.accepted;
    },
    [reportClimbWithUndoTarget],
  );

  const getUndoTarget = useCallback((): BoardPresenceClimb | null => undoTargetRef.current, []);

  return useMemo<UseBoardPresenceResult>(
    () => ({
      currentClimb: state.currentClimb,
      previousClimb: state.previousClimb,
      undoTarget,
      history: state.history,
      stats,
      isLive,
      reportClimb,
      reportClimbWithUndoTarget,
      getUndoTarget,
    }),
    [
      state.currentClimb,
      state.previousClimb,
      undoTarget,
      state.history,
      stats,
      isLive,
      reportClimb,
      reportClimbWithUndoTarget,
      getUndoTarget,
    ],
  );
}
