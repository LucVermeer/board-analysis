// Renderer-agnostic React hook over the pure board-presence reducer.
//
// Binds a `BoardPresenceClient` (injected transport) to
// `boardPresenceReducer`, exposing the wall's "now playing" state plus two
// actions (report a fresh climb, and undo an accidental takeover). All platform
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
import type { BoardPresenceClimb, BoardPresenceStats, ClimbInput, ClimbQueueItemInput } from '@boardsesh/shared-schema';
import type { BoardPresenceClient } from './types';

/**
 * Reconstruct the minimal `ClimbInput` needed to re-report a wall climb from
 * the denormalised `BoardPresenceClimb`. The presence feed only carries display
 * fields, so the rest are filled with neutral defaults; the server re-derives
 * canonical climb metadata from the uuid. Only the uuid + angle drive a report.
 */
function presenceClimbToClimbInput(presenceClimb: BoardPresenceClimb): ClimbInput {
  return {
    uuid: presenceClimb.climbUuid,
    setter_username: presenceClimb.setter ?? '',
    name: presenceClimb.name ?? '',
    frames: presenceClimb.frames ?? '',
    angle: presenceClimb.angle ?? 0,
    ascensionist_count: 0,
    difficulty: presenceClimb.grade ?? '',
    quality_average: '',
    stars: 0,
    difficulty_error: '',
  };
}

export type UseBoardPresenceResult = {
  currentClimb: BoardPresenceState['currentClimb'];
  previousClimb: BoardPresenceState['previousClimb'];
  history: BoardPresenceState['history'];
  stats: BoardPresenceStats | null;
  /** True while a live subscription is attached for the active board. */
  isLive: boolean;
  /** Report a freshly-lit climb to the active board. Resolves to the accepted flag. */
  reportClimb: (climb: ClimbQueueItemInput, angle: number | null) => Promise<boolean>;
  /**
   * Re-report the previous climb — the accidental-takeover Undo. No-op (resolves
   * `false`) when there is no previous climb.
   */
  undo: () => Promise<boolean>;
};

export function useBoardPresence(boardId: number | null, client: BoardPresenceClient | null): UseBoardPresenceResult {
  const [state, dispatch] = useReducer(boardPresenceReducer, initialBoardPresenceState);
  const [stats, setStats] = useState<BoardPresenceStats | null>(null);
  const [isLive, setIsLive] = useState(false);

  // Live refs so the report/undo callbacks stay identity-stable while still
  // reading the current board, client, and previous climb.
  const boardIdRef = useRef(boardId);
  boardIdRef.current = boardId;
  const clientRef = useRef(client);
  clientRef.current = client;
  const previousClimbRef = useRef<BoardPresenceClimb | null>(state.previousClimb);
  previousClimbRef.current = state.previousClimb;

  useEffect(() => {
    // No board or no transport: collapse to the initial state and stay inert.
    if (boardId === null || client === null) {
      dispatch({ type: 'RESET' });
      setStats(null);
      setIsLive(false);
      return;
    }

    // Reset for the board we're about to attach to, so the prior board's
    // history/current never bleeds into this one.
    dispatch({ type: 'RESET' });
    setStats(null);

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

  const reportClimb = useCallback(async (climb: ClimbQueueItemInput, angle: number | null): Promise<boolean> => {
    const activeBoardId = boardIdRef.current;
    const activeClient = clientRef.current;
    if (activeBoardId === null || activeClient === null) {
      return false;
    }
    return activeClient.reportClimb(activeBoardId, climb, angle);
  }, []);

  const undo = useCallback(async (): Promise<boolean> => {
    const activeBoardId = boardIdRef.current;
    const activeClient = clientRef.current;
    const previousClimb = previousClimbRef.current;
    if (activeBoardId === null || activeClient === null || previousClimb === null) {
      return false;
    }
    // Re-light the climb that was on the wall before the (accidental) takeover.
    // We forward the angle the previous climb was sent at; everything the
    // BoardPresenceClimb doesn't carry, the server re-derives from the climb
    // uuid + caller identity (only the uuid + angle are load-bearing for a
    // report).
    const climb: ClimbQueueItemInput = {
      uuid: previousClimb.queueItemUuid ?? previousClimb.climbUuid,
      climb: presenceClimbToClimbInput(previousClimb),
    };
    return activeClient.reportClimb(activeBoardId, climb, previousClimb.angle ?? null);
  }, []);

  return useMemo<UseBoardPresenceResult>(
    () => ({
      currentClimb: state.currentClimb,
      previousClimb: state.previousClimb,
      history: state.history,
      stats,
      isLive,
      reportClimb,
      undo,
    }),
    [state.currentClimb, state.previousClimb, state.history, stats, isLive, reportClimb, undo],
  );
}
