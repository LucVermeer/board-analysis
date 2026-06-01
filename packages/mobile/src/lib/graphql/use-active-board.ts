// The single source of truth for the mobile user's **active board** — the one
// they picked from the boards tab, used by the BLE wrapper, the shared
// BoardProvider, the climb list, and the play drawer.
//
// Backed by AsyncStorage (`active-board-store`) so the choice survives a cold
// start, with the server default (`GET_DEFAULT_BOARD`) as the first-run seed.
// Exposed through React Query so every reader updates reactively the instant
// the board switches — without each one re-reading storage or re-fetching.
//
// Shape parity: the queryFn returns a `UserBoard | null`, exactly what
// `useDefaultBoard()` returned, so readers swap the hook name and nothing else.

import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { UserBoard } from '@boardsesh/shared-schema';
import { getHttpClient } from './client';
import { GET_DEFAULT_BOARD, type GetDefaultBoardQueryResponse } from './operations';
import { getStoredActiveBoard, setStoredActiveBoard } from '../active-board-store';

export const ACTIVE_BOARD_QUERY_KEY = ['activeBoard'] as const;

/**
 * Resolve the active board: the locally-stored pick if present, otherwise the
 * server default — which is then persisted so the next launch reads it from
 * storage instead of hitting the network. Returns `null` when the user has no
 * stored board and the server has no default (e.g. an account with no boards).
 */
async function resolveActiveBoard(): Promise<UserBoard | null> {
  const stored = await getStoredActiveBoard();
  if (stored) return stored;

  const response = await getHttpClient().request<GetDefaultBoardQueryResponse>(GET_DEFAULT_BOARD);
  const serverDefault = response.defaultBoard;
  if (serverDefault) {
    // Seed storage so the choice survives the next cold start.
    await setStoredActiveBoard(serverDefault);
  }
  return serverDefault;
}

/**
 * Read the active board. Drop-in replacement for `useDefaultBoard()` — same
 * `UserBoard | null` data shape — but sourced from storage-first resolution
 * and shared via the `['activeBoard']` query key.
 */
export function useActiveBoard() {
  return useQuery({
    queryKey: ACTIVE_BOARD_QUERY_KEY,
    queryFn: resolveActiveBoard,
    // The stored board is authoritative until the user explicitly switches
    // (which calls setActiveBoard and updates the cache directly), so there's
    // no value in background refetching here.
    staleTime: Infinity,
  });
}

/**
 * Returns a setter that records the user's board choice: persisted to storage
 * (survives relaunch) and written straight into the `['activeBoard']` cache so
 * every reader re-renders with the new board immediately, no refetch.
 */
export function useSetActiveBoard() {
  const queryClient = useQueryClient();
  return useCallback(
    async (board: UserBoard) => {
      await setStoredActiveBoard(board);
      queryClient.setQueryData<UserBoard | null>(ACTIVE_BOARD_QUERY_KEY, board);
    },
    [queryClient],
  );
}
