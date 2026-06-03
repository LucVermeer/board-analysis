import type { BoardName } from '@boardsesh/shared-schema';
import { getBoardRenderData } from './board-details';

/**
 * The minimal per-hold geometry the interactive editor needs to place a tap
 * target + painted indicator. Both Aurora (`getBoardRenderData`) and MoonBoard
 * (`getMoonBoardDetails`, added in the MoonBoard PR) already produce
 * `{id, cx, cy, r}` in board-space pixels, so one editor renders either family.
 */
export type BoardHoldTarget = { id: number; cx: number; cy: number; r: number };

export type CreateBoardHolds = {
  holdTargets: BoardHoldTarget[];
  boardWidth: number;
  boardHeight: number;
  family: 'aurora' | 'moonboard';
};

/**
 * Resolve the full set of tappable holds for a board configuration, board-family
 * agnostic. Aurora boards come from the hole-placement pipeline; the MoonBoard
 * grid branch is added alongside MoonBoard create support.
 */
export function getCreateBoardHolds(cfg: {
  boardName: BoardName;
  layoutId: number;
  sizeId: number;
  setIds: number[];
}): CreateBoardHolds | null {
  // MoonBoard uses a separate grid source (getMoonBoardDetails); added in the
  // MoonBoard PR. For now every supported create board is an Aurora board.
  const data = getBoardRenderData(cfg);
  if (!data) return null;
  return {
    holdTargets: data.holdsData.map((hold) => ({ id: hold.id, cx: hold.cx, cy: hold.cy, r: hold.r })),
    boardWidth: data.boardWidth,
    boardHeight: data.boardHeight,
    family: 'aurora',
  };
}
