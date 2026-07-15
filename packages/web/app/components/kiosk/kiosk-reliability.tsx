'use client';

// Reliability plumbing for a 24/7 unattended TV. Nothing here renders UI.
//
// Three layers, from cheapest to bluntest:
//  1. Per-board catch-up (KioskBoardFeedBridge): the live feed rides Redis
//     pub/sub with no replay, so a throttled/suspended socket silently drops
//     events. A 5-minute `refresh('manual')` + a visibilitychange catch-up
//     re-reads the durable history. The ws client's own reconnect/backoff (and
//     the shared hook's reconnect catch-up) handle the fast path — this is the
//     slow safety net.
//  2. Config poll (KioskReliability): re-fetch the kiosk config every 5
//     minutes over anon HTTP; when `updatedAt` moves (or the kiosk vanishes),
//     `location.reload()` picks up the new layout server-side.
//  3. Daily 04:00 reload: clears whatever a week-long browser session accrues
//     (detached listeners, fragmented heap, stale JS after a deploy).
//
// Plus a screen wake lock so the TV never sleeps mid-session.

import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  useBoardPresenceActions,
  useBoardPresenceCurrent,
  useBoardPresenceFeed,
} from '@boardsesh/board-presence-react';
import { GET_GYM_KIOSK, type GetGymKioskQueryResponse } from '@boardsesh/graphql/operations';
import { executeGraphQL } from '@/app/lib/graphql/client';
import { useWakeLock } from '../board-bluetooth-control/use-wake-lock';
import type { KioskBoardSnapshot } from './presence/use-kiosk-board-presence';

/** How often each board re-reads the durable history to repair silent drops. */
const BOARD_FEED_CATCH_UP_INTERVAL_MS = 5 * 60 * 1000;
/** How often the kiosk config is re-fetched to detect a re-configured layout. */
const CONFIG_POLL_INTERVAL_MS = 5 * 60 * 1000;
/**
 * Minimum page age before a config mismatch may reload. The server render is
 * cached with `revalidate: 60`, so right after an edit a reload can serve the
 * SAME stale HTML while the client poll already sees the new `updatedAt` —
 * reloading immediately would loop until the cache revalidates. Waiting out
 * the revalidate window (with margin) bounds it to one reload per poll tick.
 */
const MIN_PAGE_AGE_BEFORE_RELOAD_MS = 90 * 1000;
/** Local hour for the daily maintenance reload (4am — gyms are empty). */
const DAILY_RELOAD_HOUR = 4;

/**
 * Mounted by the presence hub INSIDE each board's BoardPresenceProvider.
 * Publishes the board's live snapshot up to the hub's Map context and runs the
 * per-board catch-up cadence (layer 1 above).
 */
export function KioskBoardFeedBridge({
  boardId,
  onSnapshot,
}: {
  boardId: number;
  onSnapshot: (boardId: number, snapshot: KioskBoardSnapshot) => void;
}) {
  const { currentClimb, isLive } = useBoardPresenceCurrent();
  const { history } = useBoardPresenceFeed();
  const { refresh } = useBoardPresenceActions();

  useEffect(() => {
    onSnapshot(boardId, { currentClimb, history, isLive });
  }, [boardId, onSnapshot, currentClimb, history, isLive]);

  useEffect(() => {
    const intervalId = setInterval(() => refresh('manual'), BOARD_FEED_CATCH_UP_INTERVAL_MS);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refresh('foreground');
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refresh]);

  return null;
}

/**
 * Page-level reliability: wake lock, config-change reload, daily reload
 * (layers 2 + 3 above). Mounted once per kiosk page.
 */
export default function KioskReliability({
  gymSlug,
  kioskSlug,
  initialUpdatedAt,
}: {
  gymSlug: string;
  kioskSlug: string | null;
  /** The kiosk's `updatedAt` at server-render time; any change forces a reload. */
  initialUpdatedAt: string;
}) {
  useWakeLock(true);

  const { data: kioskConfigData } = useQuery({
    queryKey: ['kioskConfigPoll', gymSlug, kioskSlug],
    queryFn: () =>
      executeGraphQL<GetGymKioskQueryResponse>(GET_GYM_KIOSK, { gymSlug, kioskSlug: kioskSlug ?? undefined }),
    refetchInterval: CONFIG_POLL_INTERVAL_MS,
    // A TV never backgrounds, but if the browser reports hidden anyway, keep
    // polling — the whole point is unattended freshness.
    refetchIntervalInBackground: true,
    staleTime: CONFIG_POLL_INTERVAL_MS,
  });

  const mountedAtMsRef = useRef<number | null>(null);
  useEffect(() => {
    mountedAtMsRef.current ??= Date.now();
  }, []);

  useEffect(() => {
    if (kioskConfigData === undefined) return;
    const mountedAtMs = mountedAtMsRef.current;
    if (mountedAtMs === null || Date.now() - mountedAtMs < MIN_PAGE_AGE_BEFORE_RELOAD_MS) return;
    const polledKiosk = kioskConfigData.gymKiosk;
    // Kiosk deleted/hidden → reload into the 404 (honest signal for the gym).
    // updatedAt moved → the owner re-configured it; reload to re-render
    // server-side with the new layout/branding.
    if (polledKiosk === null || polledKiosk.updatedAt !== initialUpdatedAt) {
      window.location.reload();
    }
  }, [kioskConfigData, initialUpdatedAt]);

  useEffect(() => {
    const now = new Date();
    const nextReload = new Date(now);
    nextReload.setHours(DAILY_RELOAD_HOUR, 0, 0, 0);
    if (nextReload <= now) {
      nextReload.setDate(nextReload.getDate() + 1);
    }
    const timeoutId = setTimeout(() => window.location.reload(), nextReload.getTime() - now.getTime());
    return () => clearTimeout(timeoutId);
  }, []);

  return null;
}
