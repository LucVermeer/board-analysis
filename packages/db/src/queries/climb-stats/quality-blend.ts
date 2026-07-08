import { sql, type SQL } from 'drizzle-orm';

/**
 * The single source of truth for board_climb_stats.quality_average — the
 * materialized blend of the one upstream (manufacturer) quality average and
 * Boardsesh's own native star ratings. Mirrors how ascensionist_count
 * materializes upstream_ascensionist_count + boardsesh_ascensionist_count: the
 * upstream stats writers (Aurora sync, Kilter Grips catalog sync /
 * stats-repair, MoonBoard catalog import) own upstream_quality_average; the
 * tick recompute owns boardsesh_quality_sum / boardsesh_quality_count; and
 * every one of them rewrites quality_average with THIS fragment in the same
 * statement so the blend never drifts.
 *
 *   quality_average =
 *     (COALESCE(upstream_quality_average * upstream_ascensionist_count, 0)
 *      + COALESCE(boardsesh_quality_sum, 0))
 *     / NULLIF(
 *         COALESCE(CASE WHEN upstream_quality_average IS NOT NULL
 *                       THEN upstream_ascensionist_count END, 0)
 *         + COALESCE(boardsesh_quality_count, 0), 0)
 *
 * Result is NULL when both sides are absent (no upstream quality with a
 * non-zero weight, and no Boardsesh votes).
 *
 * Upstream weight = upstream_ascensionist_count. This is a DOCUMENTED
 * approximation: the manufacturer publishes only one aggregate quality average
 * per (climb, angle), never the number of ratings behind it, so we weight it by
 * the ascent count as the best available proxy for how many voices it
 * represents. A Boardsesh vote is worth one ascent's worth of upstream signal.
 *
 * The CASE guard on the weight matters: when upstream_quality_average IS NULL
 * (no manufacturer quality) the upstream term drops out of BOTH numerator and
 * denominator, so the result is the pure Boardsesh average — a Boardsesh vote
 * on a climb the manufacturer never rated is not diluted by a phantom
 * zero-quality upstream.
 *
 * Boardsesh-OWNED climbs are NOT blended: they have no upstream side, so the
 * recompute keeps quality_average as a plain AVG over their ticks. Do not use
 * this fragment on the owned branch.
 *
 * The caller supplies each term as a SQL fragment so the same blend works from
 * every context: the recompute reads the stored upstream columns + the freshly
 * aggregated Boardsesh terms; an upsert reads `excluded.*` / a GREATEST(...) of
 * stored-and-incoming for the term(s) it is changing. Because Postgres UPDATE
 * SET expressions see the OLD value of the target row's columns, a writer that
 * also changes upstream_ascensionist_count in the same SET must pass the NEW
 * (post-GREATEST) expression here, not the bare column — otherwise the blend
 * weights against the stale count.
 */
export function blendedQualityAverageSql(args: {
  upstreamQualityAverage: SQL;
  upstreamAscensionistCount: SQL;
  boardseshQualitySum: SQL;
  boardseshQualityCount: SQL;
}): SQL {
  const { upstreamQualityAverage, upstreamAscensionistCount, boardseshQualitySum, boardseshQualityCount } = args;
  return sql`(
    (COALESCE(${upstreamQualityAverage} * ${upstreamAscensionistCount}, 0) + COALESCE(${boardseshQualitySum}, 0))
    / NULLIF(
        COALESCE(CASE WHEN ${upstreamQualityAverage} IS NOT NULL THEN ${upstreamAscensionistCount} END, 0)
        + COALESCE(${boardseshQualityCount}, 0),
        0
      )
  )`;
}
