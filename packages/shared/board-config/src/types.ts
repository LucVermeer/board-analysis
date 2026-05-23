import type { BoardName } from '@boardsesh/shared-schema';

export type Angle = number;
export type SetIdList = number[];

export type ClimbCompatibilityInput = {
  boardType?: string;
  layoutId?: number | null;
  frames: string | null | undefined;
};

export type BoardCompatibilityTarget = {
  board_name: BoardName;
  layout_id: number;
  holdsData?: { id: number }[] | null;
};
