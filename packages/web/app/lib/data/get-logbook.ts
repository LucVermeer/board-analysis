import { dbz } from '@/app/lib/db/db';
import type { ClimbUuid } from '../types';
import type { LogbookEntry, AuroraBoardName } from '../api-wrappers/aurora/types';
import { boardseshTicks, boardClimbAliases } from '@/app/lib/db/schema';
import { notAuroraTwinDuplicate } from '@boardsesh/db/queries';
import { eq, and, inArray, desc, sql } from 'drizzle-orm';

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
  const baseConditions = [
    eq(boardseshTicks.boardType, board),
    eq(boardseshTicks.userId, userId),
    // Aurora's own duplicate ascents appear once (#3535).
    notAuroraTwinDuplicate(boardseshTicks),
  ];

  if (climbUuids && climbUuids.length > 0) {
    baseConditions.push(inArray(boardseshTicks.climbUuid, climbUuids));
  }

  // Resolve dedup-merged climbs: a tick's climb_uuid may be an alias UUID that
  // was deduplicated away (no row in board_climbs). Map it to the canonical via
  // board_climb_aliases so downstream consumers (which key on climb_uuid) find
  // the real climb instead of rendering "Unknown Climb". Ticks already pointing
  // at a canonical have a self-alias or no alias row, so COALESCE falls back to
  // the tick's own climb_uuid — backwards-compatible with the old direct read.
  const results = await dbz
    .select({
      tick: boardseshTicks,
      canonicalClimbUuid: sql<string>`COALESCE(${boardClimbAliases.canonicalUuid}, ${boardseshTicks.climbUuid})`,
    })
    .from(boardseshTicks)
    .leftJoin(
      boardClimbAliases,
      and(
        eq(boardseshTicks.climbUuid, boardClimbAliases.aliasUuid),
        eq(boardseshTicks.boardType, boardClimbAliases.boardType),
      ),
    )
    .where(and(...baseConditions))
    .orderBy(desc(boardseshTicks.climbedAt));

  // Transform boardsesh_ticks to LogbookEntry format
  return results.map(({ tick, canonicalClimbUuid }) => {
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
      climb_uuid: canonicalClimbUuid,
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
