import type { BoardName } from '@boardsesh/shared-schema';

const MAX_CLIMB_STARS = 15;
const MOONBOARD_QUALITY_TO_STARS = 3;
const AURORA_QUALITY_TO_STARS = 5;

export function getClimbStars(
  boardName: BoardName | null | undefined,
  qualityAverage: number | string | null | undefined,
): number {
  const quality = Number(qualityAverage);
  if (!Number.isFinite(quality) || quality <= 0) {
    return 0;
  }

  const multiplier = boardName === 'moonboard' ? MOONBOARD_QUALITY_TO_STARS : AURORA_QUALITY_TO_STARS;
  return Math.min(MAX_CLIMB_STARS, Math.round(quality * multiplier));
}
