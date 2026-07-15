'use client';

// Period leaderboard (Last 24 hours / week / month) for the kiosk rail: one
// anonymous HTTP `boardLeaderboard` query per scoped board, merged by user.
// React Query refetches every 60s so an unattended TV stays fresh.
//
// Deploy-order note: the 'day' period (rolling 24h) and anonymous access land
// with PR #3629. Until that's live in production, a 'day'-scoped rail resolves
// to the query's error state and the rail shows its empty-state copy — the
// kiosk itself keeps running.

import { useQuery } from '@tanstack/react-query';
import {
  GET_BOARD_LEADERBOARD,
  type GetBoardLeaderboardQueryResponse,
  type GetBoardLeaderboardQueryVariables,
} from '@boardsesh/graphql/operations';
import type { KioskLeaderboardPeriod } from '@boardsesh/kiosk';
import type { BoardLeaderboard } from '@boardsesh/shared-schema';
import { executeGraphQL } from '@/app/lib/graphql/client';
import { mergePeriodLeaderboards, type KioskLeaderboardRowData } from './leaderboard-model';

export type KioskPeriodLeaderboardPeriod = Exclude<KioskLeaderboardPeriod, 'session'>;

const PERIOD_REFETCH_MS = 60_000;
/** Per-board fetch depth: enough that a 10-row merged ranking can't miss a
 * climber who is mid-pack on every individual board. */
const PER_BOARD_FETCH_LIMIT = 50;

export type PeriodLeaderboardResult = {
  rows: KioskLeaderboardRowData[];
  isError: boolean;
  /** Epoch ms of the last successful fetch, for the rail footer. */
  updatedAtMs: number | null;
};

export function usePeriodLeaderboard(
  boardUuids: string[],
  period: KioskPeriodLeaderboardPeriod,
  enabled: boolean,
): PeriodLeaderboardResult {
  const { data, isError, dataUpdatedAt } = useQuery({
    queryKey: ['kioskPeriodLeaderboard', period, boardUuids],
    enabled: enabled && boardUuids.length > 0,
    refetchInterval: PERIOD_REFETCH_MS,
    refetchIntervalInBackground: true,
    queryFn: async (): Promise<KioskLeaderboardRowData[]> => {
      const settled = await Promise.allSettled(
        boardUuids.map((boardUuid) =>
          executeGraphQL<GetBoardLeaderboardQueryResponse, GetBoardLeaderboardQueryVariables>(GET_BOARD_LEADERBOARD, {
            input: { boardUuid, period, limit: PER_BOARD_FETCH_LIMIT },
          }),
        ),
      );
      const leaderboards: BoardLeaderboard[] = [];
      for (const result of settled) {
        if (result.status === 'fulfilled') {
          leaderboards.push(result.value.boardLeaderboard);
        }
      }
      if (leaderboards.length === 0) {
        // Every board failed — surface an error state instead of an
        // indistinguishable "nobody climbed" empty ranking.
        throw new Error('kiosk period leaderboard: all board fetches failed');
      }
      return mergePeriodLeaderboards(leaderboards);
    },
  });

  return {
    rows: data ?? [],
    isError,
    updatedAtMs: dataUpdatedAt > 0 ? dataUpdatedAt : null,
  };
}
