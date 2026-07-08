import { sql, eq, and } from 'drizzle-orm';
import { aliasedTable } from 'drizzle-orm/alias';
import * as dbSchema from '@boardsesh/db/schema';
import { db } from '../../../db/client';

/**
 * Aliased board_difficulty_grades table for consensus grade lookups.
 * Resolves the community-voted grade from boardClimbStats.displayDifficulty
 * without a correlated subquery.
 *
 * ## Required joins (in order)
 *
 * Queries that use any of the expressions below must include these joins:
 *
 * 1. `boardClimbStats` — joined on (climbUuid, boardType, angle)
 * 2. `boardDifficultyGrades` — joined on (tick.difficulty, boardType) — user's logged grade
 * 3. `consensusGradeTable` — joined via `consensusGradeJoinCondition` — consensus grade
 *
 * Example:
 * ```ts
 * db.select({ difficultyName: difficultyNameWithFallbackExpr })
 *   .from(boardseshTicks)
 *   .leftJoin(boardClimbStats, ...)
 *   .leftJoin(boardDifficultyGrades, ...)
 *   .leftJoin(consensusGradeTable, consensusGradeJoinCondition)
 * ```
 *
 * If a required join is missing the query will produce nulls (not an error)
 * because these are LEFT JOINs with nullable column references.
 */
export const consensusGradeTable = aliasedTable(dbSchema.boardDifficultyGrades, 'consensus_grade');

/**
 * JOIN condition for consensusGradeTable.
 * Requires boardClimbStats to already be joined in the query.
 */
export const consensusGradeJoinCondition = and(
  eq(consensusGradeTable.difficulty, sql`ROUND(${dbSchema.boardClimbStats.displayDifficulty})`),
  eq(consensusGradeTable.boardType, dbSchema.boardClimbStats.boardType),
);

/**
 * Consensus difficulty name from the joined consensus grade table.
 * Requires `consensusGradeTable` LEFT JOIN (see {@link consensusGradeTable}).
 */
export const consensusDifficultyNameExpr = sql<string | null>`${consensusGradeTable.boulderName}`;

/**
 * COALESCE user-logged grade with consensus grade.
 * Falls back to consensus when the user didn't log a grade.
 * Requires both `boardDifficultyGrades` and `consensusGradeTable` LEFT JOINs
 * (see {@link consensusGradeTable}).
 */
export const difficultyNameWithFallbackExpr = sql<string | null>`COALESCE(
  ${dbSchema.boardDifficultyGrades.boulderName},
  ${consensusGradeTable.boulderName}
)`;

/**
 * Rounded consensus difficulty ID.
 * Requires `boardClimbStats` to be joined in the query.
 */
export const consensusDifficultyExpr = sql<number | null>`ROUND(${dbSchema.boardClimbStats.displayDifficulty})`;

/**
 * JOIN condition for the Boardsesh grade table (`board_climb_grades`) on a tick
 * row, keyed on the tick's OWN angle + board type + the alias-resolved canonical
 * climb UUID. Mirrors the `board_climb_stats` join the tick queries already do
 * (`COALESCE(board_climb_aliases.canonical_uuid, boardsesh_ticks.climb_uuid)`),
 * so a tick pointing at a deduped-away alias UUID still resolves its grade.
 *
 * ## Required joins (in order)
 *
 * A query using this condition must already have joined:
 *  1. `boardClimbAliases` — on (climb_uuid = alias_uuid, board_type) so the
 *     COALESCE below falls back to the tick's own climb UUID for non-aliased ticks.
 *  2. `boardClimbGrades` via this condition, as a LEFT JOIN — a climb with no
 *     grade row (MoonBoard, too few ascents) returns NULL grade fields, which is
 *     the safe-degradation path everywhere (the UI keeps the Aurora grade).
 *
 * Example:
 * ```ts
 * db.select({ boardseshDifficulty: boardseshDifficultyExpr, boardseshConfidence: boardseshConfidenceExpr })
 *   .from(boardseshTicks)
 *   .leftJoin(boardClimbAliases, ...)
 *   .leftJoin(dbSchema.boardClimbGrades, boardseshGradeTickJoinCondition)
 * ```
 */
export const boardseshGradeTickJoinCondition = and(
  sql`COALESCE(${dbSchema.boardClimbAliases.canonicalUuid}, ${dbSchema.boardseshTicks.climbUuid}) = ${dbSchema.boardClimbGrades.climbUuid}`,
  eq(dbSchema.boardseshTicks.boardType, dbSchema.boardClimbGrades.boardType),
  eq(dbSchema.boardseshTicks.angle, dbSchema.boardClimbGrades.angle),
);

/**
 * Boardsesh grade for the joined `board_climb_grades` row, flattened to a single
 * value on the shared difficulty scale: the cross-board universal grade when
 * present, else the within-board local grade. NULL when no grade row is joined.
 * Requires the `boardClimbGrades` LEFT JOIN (see {@link boardseshGradeTickJoinCondition}).
 */
export const boardseshDifficultyExpr = sql<number | null>`COALESCE(
  ${dbSchema.boardClimbGrades.universalGrade},
  ${dbSchema.boardClimbGrades.localGrade}
)`;

/**
 * Boardsesh grade confidence tier ('confirmed' | 'provisional' | 'setter_only')
 * from the joined `board_climb_grades` row; NULL when no grade row is joined.
 * The UI keeps the Aurora grade when this is NULL or 'setter_only'.
 * Requires the `boardClimbGrades` LEFT JOIN (see {@link boardseshGradeTickJoinCondition}).
 */
export const boardseshConfidenceExpr = sql<string | null>`${dbSchema.boardClimbGrades.confidence}`;

/**
 * Number of non-deleted comments targeting each tick, as a correlated
 * subquery.
 *
 * PRECONDITION: the outer query's FROM clause MUST include `boardseshTicks`.
 * The subquery's WHERE references `boardseshTicks.uuid` from the outer row;
 * using this expression from a query that does not join `boardseshTicks`
 * produces a Postgres error at runtime (there is no compile-time guard —
 * Drizzle's SQL template type cannot encode table-scope requirements).
 *
 * Correctness is also size-sensitive: this subquery runs once per returned
 * row. Only use it in queries with a bounded LIMIT (e.g. followingClimbAscents
 * caps at 100, and ticks is scoped by user + optional climbUuids). For larger
 * result sets, prefer a single LEFT JOIN on a grouped COUNT(*) CTE instead.
 */
export const tickCommentCountExpr = sql<number>`(
  SELECT COUNT(*)::int
  FROM ${dbSchema.comments}
  WHERE ${dbSchema.comments.entityType} = 'tick'
    AND ${dbSchema.comments.entityId} = ${dbSchema.boardseshTicks.uuid}
    AND ${dbSchema.comments.deletedAt} IS NULL
)`;

/**
 * Imperative query: look up consensus grade name for a specific climb+angle.
 * Used in contexts where an inline SQL expression isn't possible (e.g. event publishing).
 */
export async function getConsensusDifficultyName(
  climbUuid: string,
  boardType: string,
  angle: number,
): Promise<string | undefined> {
  const [result] = await db
    .select({ boulderName: dbSchema.boardDifficultyGrades.boulderName })
    .from(dbSchema.boardClimbStats)
    .innerJoin(
      dbSchema.boardDifficultyGrades,
      and(
        eq(dbSchema.boardDifficultyGrades.difficulty, sql`ROUND(${dbSchema.boardClimbStats.displayDifficulty})`),
        eq(dbSchema.boardDifficultyGrades.boardType, dbSchema.boardClimbStats.boardType),
      ),
    )
    .where(
      and(
        eq(dbSchema.boardClimbStats.climbUuid, climbUuid),
        eq(dbSchema.boardClimbStats.boardType, boardType),
        eq(dbSchema.boardClimbStats.angle, angle),
      ),
    )
    .limit(1);
  return result?.boulderName ?? undefined;
}
