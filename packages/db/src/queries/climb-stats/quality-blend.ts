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
 * Result is NULL only when BOTH sides are genuinely absent (no upstream quality
 * at all, and no Boardsesh votes). When the manufacturer HAS a quality but its
 * ascent-count weight is 0 (freshly uploaded climbs, or quality that arrived
 * before ascents) and there are no Boardsesh votes, the weighted division is
 * 0/0 → NULL, so we fall back to the raw upstream_quality_average rather than
 * clearing a known rating.
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
 *
 * DELIBERATE TRADE — each upstream fragment is interpolated twice (numerator
 * and denominator), so its SQL text is duplicated in the emitted statement.
 * That's fine: every caller passes per-row column references or GREATEST/
 * COALESCE arithmetic over them — cheap, side-effect-free expressions Postgres
 * evaluates per row either way, never subqueries. Deduplicating would force
 * every writer's ON CONFLICT SET into a CTE/LATERAL restructure for zero
 * measurable gain. Keep callers to that contract: don't pass a subquery as a
 * term; materialize it into a statement-level column (e.g. a CTE) first.
 */
// CALLER CONTRACT: each fragment is interpolated TWICE — pass only cheap,
// deterministic, side-effect-free expressions (column refs / COALESCE /
// GREATEST), never subqueries or volatile functions.
export function blendedQualityAverageSql(args: {
  upstreamQualityAverage: SQL;
  upstreamAscensionistCount: SQL;
  boardseshQualitySum: SQL;
  boardseshQualityCount: SQL;
}): SQL {
  const { upstreamQualityAverage, upstreamAscensionistCount, boardseshQualitySum, boardseshQualityCount } = args;
  // Outer COALESCE(..., upstreamQualityAverage): when the weighted division is
  // 0/0 (upstream quality known but zero ascent weight and no Boardsesh votes)
  // fall back to the raw upstream average instead of clearing it to NULL. When
  // upstream quality is itself NULL this fallback is also NULL, so a genuinely
  // unrated climb still resolves to NULL.
  return sql`COALESCE(
    (
      (COALESCE(${upstreamQualityAverage} * ${upstreamAscensionistCount}, 0) + COALESCE(${boardseshQualitySum}, 0))
      / NULLIF(
          COALESCE(CASE WHEN ${upstreamQualityAverage} IS NOT NULL THEN ${upstreamAscensionistCount} END, 0)
          + COALESCE(${boardseshQualityCount}, 0),
          0
        )
    ),
    ${upstreamQualityAverage}
  )`;
}
