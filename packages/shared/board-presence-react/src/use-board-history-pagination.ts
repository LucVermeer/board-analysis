// "Load older" pagination over the durable `boardHistory` query.
//
// The live window (`useBoardPresenceFeed().history`) is capped at
// `HISTORY_CAP` (50) in-memory entries — plenty for "what just happened" but
// not enough to scroll back through a busy wall's full session. This hook
// pages further back through the durable, keyset-paged `board_climb_events`
// log via `BoardPresenceClient.fetchHistory`, independent of the live feed's
// reducer/context.
//
// Deliberately lives OUTSIDE the reducer/Feed context: it has its own
// lifecycle (mount-on-demand when a sheet opens a history list, not always-on
// like the live feed), costs zero render overhead for every consumer that
// never scrolls that far, and keeps `use-board-presence`'s invariants/tests
// untouched.
//
// KNOWN SEAM: on a very busy wall with the history sheet open a long time,
// live events keep pushing into the capped in-memory window, evicting older
// entries out the bottom (`HISTORY_CAP`). If that eviction races ahead of
// this hook's own paging, a gap can open between the live window's oldest
// entry and this hook's most recently loaded page. This is accepted as a rare
// edge case — sheet sessions are short, and every `loadOlder` call re-anchors
// its cursor on the current minimum known `seq` (across the live window AND
// everything already paged in), so at worst a climb near that boundary is
// skipped rather than duplicated.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BoardPresenceClimb } from '@boardsesh/shared-schema';
import { useBoardPresenceClient } from './board-presence-provider';
import { useBoardPresenceFeed } from './board-presence-provider';
import { boardHistoryCursor } from './types';

const DEFAULT_PAGE_SIZE = 50;

/** Telemetry payload for a single resolved `loadOlder` page, handed to the
 * optional `onPageLoaded` callback so platforms can track it without this
 * renderer-agnostic package importing an analytics client. */
export type BoardHistoryPageLoadedInfo = {
  pageSize: number;
  /** Raw count `fetchHistory` returned for this page, BEFORE dedup against
   * already-known entries — matches the number `hasMore` is derived from. */
  returnedCount: number;
};

export type BoardHistoryPagination = {
  /** Older-than-the-live-window climbs loaded so far, newest-first, deduped
   * against the live window and every prior page. */
  olderHistory: BoardPresenceClimb[];
  isLoadingOlder: boolean;
  /** False once a page came back shorter than `pageSize`, or a page fetch
   * rejected. True before the first `loadOlder` call (unknown yet). */
  hasMore: boolean;
  /** Fetch the next page back. No-op while a load is already in flight, once
   * `hasMore` is false, or when the active client doesn't implement
   * `fetchHistory` (e.g. a logged-out web client — `boardHistory` is
   * auth-required server-side). */
  loadOlder: () => void;
};

function historyEntryKey(climb: BoardPresenceClimb): string {
  return `${climb.climbUuid}:${climb.seq}`;
}

function lowestKnownSeq(climbs: BoardPresenceClimb[]): number | null {
  if (climbs.length === 0) {
    return null;
  }
  return climbs.reduce((lowest, climb) => Math.min(lowest, climb.seq), Number.POSITIVE_INFINITY);
}

/**
 * Page backward through a board's durable history log, beyond the live feed's
 * in-memory window. See the file header for why this lives outside the
 * reducer/Feed context.
 */
export function useBoardHistoryPagination(
  pageSize = DEFAULT_PAGE_SIZE,
  onPageLoaded?: (info: BoardHistoryPageLoadedInfo) => void,
): BoardHistoryPagination {
  const { boardId, client } = useBoardPresenceClient();
  const { history: liveHistory } = useBoardPresenceFeed();

  const [olderHistory, setOlderHistory] = useState<BoardPresenceClimb[]>([]);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  // Unknown until the first page resolves — default to true so the first
  // `loadOlder` call is never suppressed by this flag.
  const [hasMore, setHasMore] = useState(true);

  // Live refs so `loadOlder` stays identity-stable across renders while still
  // reading the current board/client/live-window/already-loaded state, and so
  // async continuations can validate they're still relevant.
  const boardIdRef = useRef(boardId);
  boardIdRef.current = boardId;
  const clientRef = useRef(client);
  clientRef.current = client;
  const liveHistoryRef = useRef(liveHistory);
  liveHistoryRef.current = liveHistory;
  const olderHistoryRef = useRef(olderHistory);
  olderHistoryRef.current = olderHistory;
  const isLoadingRef = useRef(false);
  const hasMoreRef = useRef(true);
  const onPageLoadedRef = useRef(onPageLoaded);
  onPageLoadedRef.current = onPageLoaded;
  // Bumped every time the bound board/client changes; an in-flight request's
  // continuation compares against this to detect a stale result. Paired with
  // `isActiveRef`, which the reset effect's cleanup flips off — covering both
  // a board switch AND an unmount the same way `use-board-presence` does.
  const generationRef = useRef(0);
  const isActiveRef = useRef(true);

  // Reset all paging state whenever the bound board or client changes (a new
  // board's durable history is a different cursor space entirely) — mirrors
  // `use-board-presence`'s per-board RESET.
  useEffect(() => {
    isActiveRef.current = true;
    generationRef.current += 1;
    isLoadingRef.current = false;
    hasMoreRef.current = true;
    olderHistoryRef.current = [];
    setOlderHistory([]);
    setIsLoadingOlder(false);
    setHasMore(true);
    return () => {
      isActiveRef.current = false;
    };
  }, [boardId, client]);

  const loadOlder = useCallback(() => {
    const activeBoardId = boardIdRef.current;
    const activeClient = clientRef.current;
    if (activeBoardId === null || activeClient === null || activeClient.fetchHistory === undefined) {
      return;
    }
    if (isLoadingRef.current || !hasMoreRef.current) {
      return;
    }

    const knownClimbs = [...liveHistoryRef.current, ...olderHistoryRef.current];
    const minSeq = lowestKnownSeq(knownClimbs);
    const cursor = minSeq === null ? undefined : boardHistoryCursor(minSeq);

    const requestGeneration = generationRef.current;
    isLoadingRef.current = true;
    setIsLoadingOlder(true);

    void activeClient
      .fetchHistory(activeBoardId, { limit: pageSize, before: cursor })
      .then((page) => {
        if (!isActiveRef.current || generationRef.current !== requestGeneration) {
          return;
        }
        const knownKeys = new Set([...liveHistoryRef.current, ...olderHistoryRef.current].map(historyEntryKey));
        // Duplicates always defer to the already-known entry: the durable
        // `boardHistory` query re-resolves sender identity via a live DB join
        // and nulls `queueItemUuid`/`gradeColor`, so the same (climbUuid, seq)
        // can differ in shape from the live-feed/prior-page variant — the
        // live-feed shape is the richer one (mirrors the reducer's
        // `mergeHistory` policy).
        const deduped = page.filter((climb) => !knownKeys.has(historyEntryKey(climb)));
        const nextOlderHistory = [...olderHistoryRef.current, ...deduped];
        olderHistoryRef.current = nextOlderHistory;
        setOlderHistory(nextOlderHistory);
        const nextHasMore = page.length === pageSize;
        hasMoreRef.current = nextHasMore;
        setHasMore(nextHasMore);
        onPageLoadedRef.current?.({ pageSize, returnedCount: page.length });
      })
      .catch(() => {
        if (!isActiveRef.current || generationRef.current !== requestGeneration) {
          return;
        }
        // `boardHistory` is auth-required server-side — an anonymous client
        // (or any other failure) should degrade to "no more history" rather
        // than retry forever.
        hasMoreRef.current = false;
        setHasMore(false);
      })
      .finally(() => {
        if (!isActiveRef.current || generationRef.current !== requestGeneration) {
          return;
        }
        isLoadingRef.current = false;
        setIsLoadingOlder(false);
      });
  }, [pageSize]);

  return useMemo<BoardHistoryPagination>(
    () => ({ olderHistory, isLoadingOlder, hasMore, loadOlder }),
    [olderHistory, isLoadingOlder, hasMore, loadOlder],
  );
}
