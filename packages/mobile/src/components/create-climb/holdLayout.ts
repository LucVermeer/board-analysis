import type { BoardHoldTarget } from '../../lib/create-board-holds';

/** Minimum touch target per the iOS HIG / a11y guidance. */
export const MIN_TAP_DIAMETER = 44;

/**
 * Append an alpha channel to a `#RGB`/`#RRGGBB` hex color. Returns the input
 * unchanged for anything else (e.g. the `#FFF` fallback the frame parser emits
 * for unknown codes) so we never produce an invalid color string.
 */
export function hexWithAlpha(hex: string, alpha: number): string {
  const clamped = Math.max(0, Math.min(1, alpha));
  const aa = Math.round(clamped * 255)
    .toString(16)
    .padStart(2, '0');
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) return `${hex}${aa}`;
  if (/^#[0-9a-fA-F]{3}$/.test(hex)) {
    const [, r, g, b] = hex;
    return `#${r}${r}${g}${g}${b}${b}${aa}`;
  }
  return hex;
}

export type HoldGeometry = {
  /** Percentage anchor of the hold centre across the board (resolution-independent). */
  leftPct: number;
  topPct: number;
  /** Painted-ring diameter in device px (centred on the anchor via negative margins). */
  ringDiameter: number;
  /** Transparent tap-target diameter in device px (>= MIN_TAP_DIAMETER). */
  tapDiameter: number;
};

/**
 * Compute a hold's on-screen geometry. Positions stay percentage-based — the
 * viewport box already has the board's aspect ratio, so a mid-session relayout
 * (rotation, keyboard) self-corrects. Only the diameter needs the measured
 * device-px scale. `mirrored` flips horizontally for left-handed preview without
 * touching which hold id is written.
 */
export function holdGeometry(
  hold: BoardHoldTarget,
  boardWidth: number,
  boardHeight: number,
  measuredWidth: number,
  mirrored: boolean,
  radiusMultiplier = 1,
): HoldGeometry {
  const scale = measuredWidth / boardWidth;
  const cxPct = (hold.cx / boardWidth) * 100;
  const leftPct = mirrored ? 100 - cxPct : cxPct;
  const topPct = (hold.cy / boardHeight) * 100;
  const ringDiameter = hold.r * 2 * scale * radiusMultiplier;
  const tapDiameter = Math.max(ringDiameter * 1.6, MIN_TAP_DIAMETER);
  return { leftPct, topPct, ringDiameter, tapDiameter };
}
