'use client';

import { useCallback, useMemo, useRef } from 'react';
import {
  usePlaylistClimbActivation as useSharedPlaylistClimbActivation,
  type PlaylistActivationBoardTarget,
  type PlaylistActivationQueueApi,
} from '@boardsesh/playlists-react';
import type { Climb as QueueClimb } from '@boardsesh/queue';
import type { BoardDetails, Climb } from '@/app/lib/types';
import { getBoardDetailsForPlaylist, getDefaultAngleForBoard } from '@/app/lib/board-config-for-playlist';
import { canAddClimbToBoard } from '@/app/lib/board-compatibility';
import { getQueueBoardKey } from './playlist-suggestions';
import { dispatchOpenPlayDrawer } from './play-drawer-event';
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

/**
 * Web adapter over the shared `usePlaylistClimbActivation`. Keeps the web-facing
 * options the two playlist screens already pass, and maps them onto the shared,
 * platform-agnostic activation contract:
 *  - `resolveTarget` derives the bound board (active queue board → selected
 *    board → playlist board) plus angle + climbability predicate, and stashes
 *    the resolved `BoardDetails` by `boardKey` so the web fetch (which needs the
 *    full details) can recover them.
 *  - `fetchClimbsForBoard` translates the shared `{ target }` arg back to the
 *    web `{ boardDetails, angle }` the screens' fetchers expect.
 *  - `queueApi` / `onActivated` wire web queue actions and the play-drawer open.
 */
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
}: UsePlaylistClimbActivationOptions): (climb: Climb) => Promise<void> {
  const activeBoardDetails = activeQueueBoardInfo.boardDetails;
  const activeAngle = activeQueueBoardInfo.angle;
  const selectedBoardType = selectedBoard?.boardType;
  const selectedLayoutId = selectedBoard?.layoutId;
  const selectedAngle = selectedBoard?.angle;

  // Recover the full BoardDetails for a target inside fetchClimbsForBoard: the
  // shared target only carries boardKey/boardName/angle, but the web fetch needs
  // the full details. boardKey uniquely identifies a board, so a per-key stash
  // populated during resolveTarget is safe (the shared hook aborts a prior
  // refresh on re-tap, so the latest activation wins).
  const boardDetailsByKeyRef = useRef<Map<string, BoardDetails>>(new Map());

  const resolveTarget = useCallback(
    (climb: Climb): PlaylistActivationBoardTarget | null => {
      const targetBoardDetails =
        activeBoardDetails ??
        selectedBoardDetails ??
        getBoardDetailsForPlaylist(
          climb.boardType ?? selectedBoardType ?? fallbackBoardType ?? '',
          climb.layoutId ?? selectedLayoutId ?? fallbackLayoutId,
        );

      if (!targetBoardDetails) return null;

      const targetAngle = activeBoardDetails
        ? activeAngle
        : (selectedAngle ?? climb.angle ?? getDefaultAngleForBoard(targetBoardDetails.board_name));

      const boardKey = getQueueBoardKey(targetBoardDetails);
      boardDetailsByKeyRef.current.set(boardKey, targetBoardDetails);

      return {
        boardKey,
        boardName: targetBoardDetails.board_name,
        angle: targetAngle,
        isClimbable: (candidate: QueueClimb) =>
          canAddClimbToBoard(candidate as unknown as Climb, targetBoardDetails).ok,
      };
    },
    [
      activeBoardDetails,
      activeAngle,
      selectedBoardDetails,
      selectedBoardType,
      selectedLayoutId,
      selectedAngle,
      fallbackBoardType,
      fallbackLayoutId,
    ],
  );

  const fetchSharedClimbsForBoard = useCallback(
    async ({
      target,
      activatedClimbUuid,
      signal,
    }: {
      target: PlaylistActivationBoardTarget;
      activatedClimbUuid: string;
      signal: AbortSignal;
    }): Promise<QueueClimb[]> => {
      const boardDetails = boardDetailsByKeyRef.current.get(target.boardKey);
      // resolveTarget always stashes the details before the shared hook calls
      // this, so a miss is unexpected — degrade to no refreshed climbs rather
      // than throwing.
      if (!boardDetails) return [];
      const climbs = await fetchClimbsForBoard({
        boardDetails,
        angle: target.angle,
        activatedClimbUuid,
        signal,
      });
      return climbs as unknown as QueueClimb[];
    },
    [fetchClimbsForBoard],
  );

  // TYPE SEAM: web queue actions use web's Climb / ClimbQueueItem /
  // PlaylistSuggestionSource; the shared contract uses the structurally
  // compatible queue types. Runtime behaviour is identical, so cast the api
  // object at the boundary.
  const queueApi = useMemo<PlaylistActivationQueueApi | null>(() => {
    if (!queueActions) return null;
    return {
      setCurrentClimb: queueActions.setCurrentClimb,
      refreshPlaylistSuggestionSource: queueActions.refreshPlaylistSuggestionSource,
    } as unknown as PlaylistActivationQueueApi;
  }, [queueActions]);

  const onActivated = useCallback(() => {
    dispatchOpenPlayDrawer();
  }, []);

  // TYPE SEAM: web's Climb is structurally wider than the shared queue Climb;
  // the runtime objects are identical, so cast allClimbs at the boundary.
  return useSharedPlaylistClimbActivation({
    queueApi,
    sourceId,
    allClimbs: allClimbs as unknown as QueueClimb[],
    resolveTarget,
    fetchClimbsForBoard: fetchSharedClimbsForBoard,
    onActivated,
    refreshErrorMessage,
  }) as unknown as (climb: Climb) => Promise<void>;
}
