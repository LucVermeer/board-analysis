// Maps the various board shapes (saved UserBoard, popular config) onto the
// single DiscoveryBoardItem the carousel renders. Keeps the screen free of
// per-shape branching.

import type { BoardName, UserBoard, PopularBoardConfig } from '@boardsesh/shared-schema';
import { toBoardName } from '@boardsesh/board-config';
import type { DiscoveryBoardItem } from './BoardDiscoveryCard';

export function userBoardToItem(board: UserBoard, activeUuid?: string | null): DiscoveryBoardItem | null {
  const boardName = toBoardName(board.boardType);
  if (boardName === null) return null;
  return {
    key: board.uuid,
    boardName,
    layoutId: board.layoutId,
    sizeId: board.sizeId,
    setIds: board.setIds,
    title: board.name,
    subtitle: board.sizeName ?? board.boardType,
    distanceMeters: board.distanceMeters ?? undefined,
    isActive: activeUuid != null && board.uuid === activeUuid,
  };
}

export function popularConfigToItem(config: PopularBoardConfig): DiscoveryBoardItem | null {
  const boardName = toBoardName(config.boardType);
  if (boardName === null) return null;
  return {
    // Configs have no uuid — key on the config tuple.
    key: `popular:${config.boardType}:${config.layoutId}:${config.sizeId}:${config.setIds.join('-')}`,
    boardName,
    layoutId: config.layoutId,
    sizeId: config.sizeId,
    setIds: config.setIds.join(','),
    title: config.displayName,
    subtitle: config.sizeName ?? config.layoutName ?? config.boardType,
  };
}
