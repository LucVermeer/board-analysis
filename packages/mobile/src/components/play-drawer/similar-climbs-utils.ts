import type { Climb, SimilarClimb } from '@boardsesh/shared-schema';
import { formatQuality } from '../../lib/format-climb-stats';

/** Minimal translate signature so this pure util stays out of React. */
type TranslateCount = (key: string, options: { count: number }) => string;

// Build a Climb stub from a SimilarClimb for queue activation (mirrors web's buildClimbStub).
export function buildClimbStub(similar: SimilarClimb, boardType: string): Climb {
  return {
    uuid: similar.uuid,
    layoutId: similar.layoutId,
    boardType,
    name: similar.name ?? '',
    setter_username: similar.setterUsername ?? '',
    frames: similar.frames ?? '',
    angle: similar.angle ?? 0,
    description: '',
    ascensionist_count: similar.ascensionistCount ?? 0,
    difficulty: similar.difficultyName ?? '',
    quality_average: similar.qualityAverage == null ? '' : similar.qualityAverage.toFixed(2),
    stars: 0,
    difficulty_error: '',
    benchmark_difficulty: null,
  };
}

// Compose the "setter · ★quality · N sends" byline, skipping null/zero fields.
export function formatByline(similar: SimilarClimb, t: TranslateCount): string {
  const parts: string[] = [];
  if (similar.setterUsername) parts.push(similar.setterUsername);
  if (similar.qualityAverage != null && similar.qualityAverage > 0) {
    parts.push(`${formatQuality(String(similar.qualityAverage))}★`);
  }
  if (similar.ascensionistCount != null && similar.ascensionistCount > 0) {
    parts.push(t('mobile.similarClimbs.sends', { count: similar.ascensionistCount }));
  }
  return parts.join(' · ');
}

export type RankedSimilarClimb = {
  climb: SimilarClimb;
  /** Whether the climb fits the viewer's current wall size. */
  compatible: boolean;
};

// Wall-size-compatible climbs first (stable within group), incompatible last — mirrors web.
export function rankBySizeCompatibility(climbs: SimilarClimb[], sizeId: number): RankedSimilarClimb[] {
  const compatible: RankedSimilarClimb[] = [];
  const incompatible: RankedSimilarClimb[] = [];
  for (const climb of climbs) {
    if (climb.compatibleSizeIds.includes(sizeId)) {
      compatible.push({ climb, compatible: true });
    } else {
      incompatible.push({ climb, compatible: false });
    }
  }
  return [...compatible, ...incompatible];
}
