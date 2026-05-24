import type { BoardName, HoldState } from '@boardsesh/shared-schema';
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

export type BoardRendererProps = {
  /** The climb's frames string encoding active holds and their roles */
  frames: string;
  /** Board name (kilter, tension, moonboard, etc.) */
  boardName: BoardName;
  /** Native pixel width of the board image coordinate system */
  boardWidth: number;
  /** Native pixel height of the board image coordinate system */
  boardHeight: number;
  /** URL(s) for the board background image(s) */
  imageUrls: string[];
  /** All hold placements on this board (position + radius data) */
  holdsData: HoldPlacement[];
  /** Whether to mirror the board horizontally */
  mirrored?: boolean;
  /** External style applied to the outermost View wrapper */
  style?: import('react-native').ViewStyle;
};
