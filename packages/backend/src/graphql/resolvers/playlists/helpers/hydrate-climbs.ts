import { eq, and, inArray, sql } from 'drizzle-orm';
import { type Climb, type BoardName } from '@boardsesh/shared-schema';
import { db } from '../../../../db/client';
import { getClimbStars, getGradeLabel } from '@boardsesh/db/queries';
import { UNIFIED_TABLES } from '../../../../db/queries/util/table-select';

const DEFAULT_ANGLE = 40;

export type ClimbRef = { climbUuid: string; boardType: string };

export type HydrateClimbsOptions = {
  /**
   * Per-ref angle override (e.g. a playlistClimbs.angle that should win over
   * the climb's stats angle). Map keys are `${boardType}:${climbUuid}`.
   * `null` values are treated as "no override" (same as omitting the entry).
   */
  angleOverrides?: Map<string, number | null>;
};

/**
 * Hydrate `(climbUuid, boardType)` refs into full Climb objects in caller-supplied order.
 *
 * Single source of truth for the climbs/climbStats join used by every "fetch a
 * page of climbs by uuid" path (smart playlists, all-boards user playlists).
 * The angle picked for each row is the one the most ascenders have logged at
 * — overridden by `angleOverrides` when the caller has a stronger signal
 * (e.g. the playlist itself stores a per-climb angle).
 */
export async function hydrateClimbsByRefs(refs: ClimbRef[], options?: HydrateClimbsOptions): Promise<Climb[]> {
  if (refs.length === 0) return [];

  const tables = UNIFIED_TABLES;
  const uuids = refs.map((ref) => ref.climbUuid);

  const rows = await db
    .select({
      climbUuid: tables.climbs.uuid,
      layoutId: tables.climbs.layoutId,
      boardType: tables.climbs.boardType,
      setter_username: tables.climbs.setterUsername,
      name: tables.climbs.name,
      description: tables.climbs.description,
      frames: tables.climbs.frames,
      statsAngle: tables.climbStats.angle,
      ascensionist_count: tables.climbStats.ascensionistCount,
      difficulty_id: sql<number | null>`ROUND(${tables.climbStats.displayDifficulty}::numeric, 0)`,
      quality_average: sql<number>`ROUND(${tables.climbStats.qualityAverage}::numeric, 2)`,
      difficulty_error: sql<number>`ROUND(${tables.climbStats.difficultyAverage}::numeric - ${tables.climbStats.displayDifficulty}::numeric, 2)`,
      benchmark_difficulty: tables.climbStats.benchmarkDifficulty,
    })
    .from(tables.climbs)
    .leftJoin(
      tables.climbStats,
      and(
        eq(tables.climbStats.boardType, tables.climbs.boardType),
        eq(tables.climbStats.climbUuid, tables.climbs.uuid),
        // Inner self-correlated subquery: the outer leftJoin target is
        // `board_climb_stats` (unaliased), and we alias the inner copy as
        // `s`. Using a bare `FROM board_climb_stats s` rather than
        // `${tables.climbStats}` interpolation makes the correlation
        // alias-stable — a future Drizzle release that aliases the outer
        // target wouldn't silently break the resolution to it.
        eq(
          tables.climbStats.angle,
          sql`(
            SELECT s.angle FROM board_climb_stats s
            WHERE s.board_type = ${tables.climbs.boardType}
              AND s.climb_uuid = ${tables.climbs.uuid}
            ORDER BY s.ascensionist_count DESC NULLS LAST
            LIMIT 1
          )`,
        ),
      ),
    )
    .where(inArray(tables.climbs.uuid, uuids));

  // Climb UUIDs can collide across boards in principle, so key by both.
  const rowsByKey = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    rowsByKey.set(`${row.boardType}:${row.climbUuid}`, row);
  }

  const climbs: Climb[] = [];
  for (const ref of refs) {
    const key = `${ref.boardType}:${ref.climbUuid}`;
    const row = rowsByKey.get(key);
    if (!row) continue;
    const override = options?.angleOverrides?.get(key);
    const angle = override ?? row.statsAngle ?? DEFAULT_ANGLE;
    const boardName = (row.boardType || ref.boardType) as BoardName;
    climbs.push({
      uuid: row.climbUuid,
      layoutId: row.layoutId,
      setter_username: row.setter_username || '',
      name: row.name || '',
      description: row.description || '',
      frames: row.frames || '',
      angle,
      ascensionist_count: Number(row.ascensionist_count || 0),
      difficulty: getGradeLabel(row.difficulty_id),
      quality_average: row.quality_average?.toString() || '0',
      stars: getClimbStars(boardName, row.quality_average),
      difficulty_error: row.difficulty_error?.toString() || '0',
      benchmark_difficulty:
        row.benchmark_difficulty && row.benchmark_difficulty > 0 ? row.benchmark_difficulty.toString() : null,
      boardType: boardName,
    });
  }

  return climbs;
}
