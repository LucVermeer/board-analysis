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
  /**
   * The hold sets bolted onto the wall. Only consulted for MoonBoard, whose
   * `holdsData` is the full grid regardless of which add-on sets are installed
   * (see `getMoonBoardDetails`), so hold-id containment alone can't tell a
   * base-set climb from a wooden-set one. Omit it and the set check is skipped.
   */
  set_ids?: number[] | null;
};
