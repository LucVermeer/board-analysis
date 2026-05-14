import { dbz } from '@/app/lib/db/db';
import type { ClimbUuid } from '../types';
import type { LogbookEntry, AuroraBoardName } from '../api-wrappers/aurora/types';
import { boardseshTicks } from '@/app/lib/db/schema';
import { eq, and, inArray, desc } from 'drizzle-orm';

/**
 * Get logbook entries for a user from boardsesh_ticks.
 * @param board - The board type (kilter, tension)
 * @param userId - NextAuth user ID (not Aurora user_id)
 * @param climbUuids - Optional array of climb UUIDs to filter by
 */
export async function getLogbook(
  board: AuroraBoardName,
  userId: string,
  climbUuids?: ClimbUuid[],
): Promise<LogbookEntry[]> {
  const baseConditions = [eq(boardseshTicks.boardType, board), eq(boardseshTicks.userId, userId)];

  if (climbUuids && climbUuids.length > 0) {
    baseConditions.push(inArray(boardseshTicks.climbUuid, climbUuids));
  }

  const results = await dbz
    .select()
    .from(boardseshTicks)
    .where(and(...baseConditions))
    .orderBy(desc(boardseshTicks.climbedAt));

  // Transform boardsesh_ticks to LogbookEntry format
  return results.map((tick) => {
    let attemptId: number;
    if (tick.status === 'flash') {
      attemptId = 1;
    } else if (tick.status === 'send') {
      attemptId = 2;
    } else {
      attemptId = 0;
    }
    return {
      uuid: tick.uuid,
      wall_uuid: null,
      climb_uuid: tick.climbUuid,
      angle: tick.angle,
      is_mirror: tick.isMirror ?? false,
      user_id: 0, // Placeholder - we use NextAuth userId now, not Aurora user_id
      attempt_id: attemptId,
      tries: tick.attemptCount,
      quality: tick.quality ?? 0,
      difficulty: tick.difficulty,
      is_benchmark: tick.isBenchmark ?? false,
      is_listed: true,
      comment: tick.comment ?? '',
      climbed_at: tick.climbedAt,
      created_at: tick.createdAt,
      updated_at: tick.updatedAt,
      is_ascent: tick.status === 'flash' || tick.status === 'send',
    };
  });
}
