import type { HoldState } from '@boardsesh/shared-schema';
import type { HoldRenderStyle } from '@boardsesh/board-constants/hold-states';

/**
 * A single hold to render on the board, with position, size, and visual properties
 * derived from parsing the climb's frames string.
 */
export type BoardHold = {
  /** Placement ID from the frames string */
  id: number;
  /** X coordinate in board-space pixels */
  cx: number;
  /** Y coordinate in board-space pixels */
  cy: number;
  /** Radius in board-space pixels */
  radius: number;
  /** Fill color for this hold (from HOLD_STATE_MAP displayColor or color) */
  color: string;
  /** Hold role name (STARTING, HAND, FINISH, FOOT, etc.) */
  role: HoldState;
  /** Render style hint — 'circle' (default) or 'above-marker' */
  renderStyle: HoldRenderStyle;
};

/**
 * Hold placement data as stored in BoardDetails.holdsData.
 * Maps 1:1 with the web's HoldRenderData type.
 */
export type HoldPlacement = {
  id: number;
  mirroredHoldId: number | null;
  cx: number;
  cy: number;
  r: number;
};
