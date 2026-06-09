// Mobile transport for the board-presence ("now on the wall") feature.
//
// `@boardsesh/board-presence-react` is renderer-agnostic: it never imports a
// GraphQL client. This factory adapts the mobile graphql-ws `Client` (the same
// one the queue provider uses) to the injected `BoardPresenceClient` interface,
// running the five board-presence operations over the wire:
//   - BOARD_NOW_PLAYING       → live subscription (returns an unsubscribe fn)
//   - BOARD_RECENT_CLIMBS     → query (late-joiner backfill)
//   - BOARD_PRESENCE_STATS    → query
//   - REPORT_BOARD_CLIMB      → mutation
//   - RESOLVE_BOARD_FOR_SERIAL→ mutation
//
// Mirrors how the queue provider runs SESSION_UPDATES/QUEUE_UPDATES (subscribe)
// and confirmClimbOnWall (execute), reusing the shared `execute`/`subscribe`
// helpers from @boardsesh/graphql-client.

import { type Client, execute, subscribe } from '@boardsesh/graphql-client';
import {
  BOARD_NOW_PLAYING,
  BOARD_PRESENCE_STATS,
  BOARD_RECENT_CLIMBS,
  REPORT_BOARD_CLIMB,
  RESOLVE_BOARD_FOR_SERIAL,
} from '@boardsesh/graphql/operations/board-presence';
import type { BoardPresenceClient } from '@boardsesh/board-presence-react';
import type {
  BoardPresenceClimb,
  BoardPresenceEvent,
  BoardPresenceStats,
  ClimbQueueItemInput,
  ResolvedBoard,
} from '@boardsesh/shared-schema';

type BoardNowPlayingData = { boardNowPlaying: BoardPresenceEvent };
type BoardRecentClimbsData = { boardRecentClimbs: BoardPresenceClimb[] };
type BoardPresenceStatsData = { boardPresenceStats: BoardPresenceStats };
type ReportBoardClimbData = { reportBoardClimb: boolean };
type ResolveBoardForSerialData = { resolveBoardForSerial: ResolvedBoard };

/**
 * Build a `BoardPresenceClient` over a mobile graphql-ws client. Pass a getter
 * (not the client itself) so the live client — which graphql-ws may dispose and
 * recreate — is read at call time, matching `getClient: () => getWsClient()` in
 * the queue provider.
 */
export function createMobileBoardPresenceClient(getClient: () => Client): BoardPresenceClient {
  return {
    subscribeNowPlaying(boardId, onEvent, onError) {
      return subscribe<BoardNowPlayingData>(
        getClient(),
        { query: BOARD_NOW_PLAYING, variables: { boardId } },
        {
          next: (data) => {
            if (data?.boardNowPlaying) {
              onEvent(data.boardNowPlaying);
            }
          },
          error: (err) => {
            onError?.(err);
          },
          complete: () => {},
        },
      );
    },

    async fetchRecentClimbs(boardId) {
      const data = await execute<BoardRecentClimbsData>(getClient(), {
        query: BOARD_RECENT_CLIMBS,
        variables: { boardId },
      });
      return data.boardRecentClimbs ?? [];
    },

    async fetchStats(boardId) {
      const data = await execute<BoardPresenceStatsData>(getClient(), {
        query: BOARD_PRESENCE_STATS,
        variables: { boardId },
      });
      return data.boardPresenceStats;
    },

    async reportClimb(boardId, climb: ClimbQueueItemInput, angle) {
      const data = await execute<ReportBoardClimbData>(getClient(), {
        query: REPORT_BOARD_CLIMB,
        variables: { boardId, climb, angle },
      });
      return data.reportBoardClimb === true;
    },

    async resolveBoardForSerial(args) {
      const data = await execute<ResolveBoardForSerialData>(getClient(), {
        query: RESOLVE_BOARD_FOR_SERIAL,
        variables: args,
      });
      return data.resolveBoardForSerial;
    },
  };
}
