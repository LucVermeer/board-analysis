// Re-export hold state types and constants from the canonical source
export {
  HOLD_STATE_MAP,
  convertLitUpHoldsStringToMap,
  STATE_TO_PRIMARY_CODE,
} from '@boardsesh/board-constants/hold-states';
export type { HoldCode, HoldColor, HoldRenderStyle, HoldStateInfo } from '@boardsesh/board-constants/hold-states';
export type { HoldState, LitupHold, LitUpHoldsMap } from '@boardsesh/shared-schema';

export type LitUpHolds = string;

export type HoldsArray = Array<HoldRenderData>;

export type HoldRenderData = {
  id: number;
  mirroredHoldId: number | null;
  cx: number;
  cy: number;
  r: number;
};

export type HeatmapData = {
  holdId: number;
  totalUses: number;
  startingUses: number;
  totalAscents: number;
  handUses: number;
  footUses: number;
  finishUses: number;
  averageDifficulty: number | null;
  userAscents?: number;
  userAttempts?: number;
};

/** Thumbnail render width in pixels. Covers 3x retina at ~64px CSS display. */
export const THUMBNAIL_WIDTH = 200;
