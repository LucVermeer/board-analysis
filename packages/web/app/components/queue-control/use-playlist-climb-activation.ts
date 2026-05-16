'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { BoardDetails, Climb } from '@/app/lib/types';
import { getBoardDetailsForPlaylist, getDefaultAngleForBoard } from '@/app/lib/board-config-for-playlist';
import { createPlaylistSuggestionSource } from './playlist-suggestions';
import { isAbortError } from './playlist-suggestion-refresh';
import type { QueueActionsType } from './types';
import type { QueueBridgeBoardInfo } from './queue-bridge-board-info-context';

type PlaylistActivationBoardSelection = {
  boardType?: string | null;
  layoutId?: number | null;
  angle?: number | null;
} | null;

type FetchPlaylistActivationClimbsArgs = {
  boardDetails: BoardDetails;
  angle: number;
  activatedClimbUuid: string;
  signal: AbortSignal;
};

type UsePlaylistClimbActivationOptions = {
  queueActions: Pick<QueueActionsType, 'setCurrentClimb' | 'refreshPlaylistSuggestionSource'> | null | undefined;
  activeQueueBoardInfo: QueueBridgeBoardInfo;
  selectedBoardDetails: BoardDetails | null;
  selectedBoard: PlaylistActivationBoardSelection;
  fallbackBoardType?: string | null;
  fallbackLayoutId?: number | null;
  sourceId: string;
  allClimbs: Climb[];
  fetchClimbsForBoard: (args: FetchPlaylistActivationClimbsArgs) => Promise<Climb[]>;
  refreshErrorMessage: string;
};

export function usePlaylistClimbActivation({
  queueActions,
  activeQueueBoardInfo,
  selectedBoardDetails,
  selectedBoard,
  fallbackBoardType,
  fallbackLayoutId,
  sourceId,
  allClimbs,
  fetchClimbsForBoard,
  refreshErrorMessage,
}: UsePlaylistClimbActivationOptions) {
  const refreshAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      refreshAbortRef.current?.abort();
    };
  }, []);

  return useCallback(
    async (climb: Climb): Promise<void> => {
      if (!queueActions) return;

      const activeBoardDetails = activeQueueBoardInfo.boardDetails;
      const targetBoardDetails =
        activeBoardDetails ??
        selectedBoardDetails ??
        getBoardDetailsForPlaylist(
          climb.boardType ?? selectedBoard?.boardType ?? fallbackBoardType ?? '',
          climb.layoutId ?? selectedBoard?.layoutId ?? fallbackLayoutId,
        );

      if (!targetBoardDetails) {
        await queueActions.setCurrentClimb(climb, { clearPlaylistSuggestionSource: true });
        return;
      }

      const targetAngle = activeBoardDetails
        ? activeQueueBoardInfo.angle
        : (selectedBoard?.angle ?? climb.angle ?? getDefaultAngleForBoard(targetBoardDetails.board_name));

      const initialSource = createPlaylistSuggestionSource({
        playlistUuid: sourceId,
        activatedClimb: climb,
        climbs: allClimbs,
        boardDetails: targetBoardDetails,
      });

      const activeItem = await queueActions.setCurrentClimb(climb, { playlistSuggestionSource: initialSource });
      if (!activeItem) return;

      refreshAbortRef.current?.abort();
      const abortController = new AbortController();
      refreshAbortRef.current = abortController;

      void (async () => {
        try {
          const fetchedClimbs = await fetchClimbsForBoard({
            boardDetails: targetBoardDetails,
            angle: targetAngle,
            activatedClimbUuid: climb.uuid,
            signal: abortController.signal,
          });
          if (abortController.signal.aborted) return;
          const refreshedSource = createPlaylistSuggestionSource({
            playlistUuid: sourceId,
            activatedClimb: climb,
            climbs: fetchedClimbs,
            boardDetails: targetBoardDetails,
          });
          queueActions.refreshPlaylistSuggestionSource(refreshedSource);
        } catch (err: unknown) {
          if (isAbortError(err)) return;
          console.error(refreshErrorMessage, err);
        } finally {
          if (refreshAbortRef.current === abortController) {
            refreshAbortRef.current = null;
          }
        }
      })();
    },
    [
      queueActions,
      activeQueueBoardInfo.boardDetails,
      activeQueueBoardInfo.angle,
      selectedBoardDetails,
      selectedBoard?.boardType,
      selectedBoard?.layoutId,
      selectedBoard?.angle,
      fallbackBoardType,
      fallbackLayoutId,
      sourceId,
      allClimbs,
      fetchClimbsForBoard,
      refreshErrorMessage,
    ],
  );
}
