import type { Climb } from '@/app/lib/types';
import type { AscentFeedItem } from '@boardsesh/graphql/operations/ticks';

export function ascentFeedItemToClimb(item: AscentFeedItem): Climb {
  return {
    uuid: item.climbUuid,
    name: item.climbName,
    setter_username: item.setterUsername ?? '',
    frames: item.frames ?? '',
    angle: item.angle,
    // Populated so downstream ClimbTitle renders the grade instead of "project".
    difficulty: item.consensusDifficultyName ?? item.difficultyName ?? '',
    quality_average: item.qualityAverage != null ? String(item.qualityAverage) : '0',
    stars: 0,
    difficulty_error: '0',
    ascensionist_count: 0,
    benchmark_difficulty: item.isBenchmark ? (item.consensusDifficultyName ?? null) : null,
    mirrored: item.isMirror,
    is_no_match: item.isNoMatch,
    layoutId: item.layoutId,
    boardType: item.boardType,
  };
}
