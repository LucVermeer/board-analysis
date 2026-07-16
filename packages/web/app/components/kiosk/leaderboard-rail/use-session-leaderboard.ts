'use client';

// Live session leaderboard over the presence hub's per-board histories.
// Recomputes when any board snapshot changes AND on a 60s tick (the rolling
// window keeps sliding even when no new send arrives, so a climber's sends
// must age out without an event).

import { useEffect, useMemo, useState } from 'react';
import { KIOSK_SESSION_WINDOW_MINUTES } from '@boardsesh/kiosk';
import type { BoardPresenceClimb } from '@boardsesh/shared-schema';
import { useKioskPresenceSnapshots } from '../presence/use-kiosk-board-presence';
import { buildSessionLeaderboardRows, type KioskLeaderboardRowData } from './leaderboard-model';

const WINDOW_TICK_MS = 60_000;

export function useSessionLeaderboard(boardIds: number[]): KioskLeaderboardRowData[] {
  const snapshots = useKioskPresenceSnapshots();

  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const intervalId = setInterval(() => setNowMs(Date.now()), WINDOW_TICK_MS);
    return () => clearInterval(intervalId);
  }, []);

  return useMemo(() => {
    const histories: BoardPresenceClimb[][] = [];
    for (const boardId of boardIds) {
      const snapshot = snapshots.get(boardId);
      if (snapshot !== undefined && snapshot.history.length > 0) {
        histories.push(snapshot.history);
      }
    }
    return buildSessionLeaderboardRows(histories, {
      windowMinutes: KIOSK_SESSION_WINDOW_MINUTES,
      now: new Date(nowMs),
    });
  }, [snapshots, boardIds, nowMs]);
}
