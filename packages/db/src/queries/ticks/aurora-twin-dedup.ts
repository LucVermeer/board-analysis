import { and, eq, isNotNull, not, notExists, or, sql, type Column, type SQL } from 'drizzle-orm';
import { QueryBuilder, alias } from 'drizzle-orm/pg-core';
import { boardseshTicks } from '../../schema';

/**
 * Read-time collapse of Aurora's own duplicate ascents (#3535).
 *
 * Aurora sometimes stores ONE ascent two-to-four times, each copy carrying its
 * own real upstream uuid. The live pull is keyed on `aurora_id`, so every copy
 * is a legitimate miss and lands as its own `boardsesh_ticks` row: the climber
 * sees the same send 2-4× in their logbook and their totals count it 2-4×.
 * Prod measured 11 groups / 25 rows fleet-wide (tension 7/16, kilter 4/9).
 *
 * Why this is a READ-side rule and not a write-side one:
 *
 *  - Every copy carries a real, still-live `aurora_id`. Deleting a copy cannot
 *    preserve that id (`boardsesh_ticks_aurora_id_unique` allows one row per
 *    id), so the next incremental pull sees an `aurora_id` miss and re-inserts
 *    it — forever. The 0165/0166 dedup migrations only avoid that because they
 *    MOVE the surrogate id onto the survivor first, which is impossible when
 *    both sides already hold a real one.
 *  - Suppressing at read time writes nothing, so the pull stays exactly as
 *    idempotent as it is today, and no row that Aurora still lists can be lost.
 *  - It heals every affected climber the moment it ships — no re-sync needed,
 *    and no backfill touching live rows for a 25-row problem.
 *
 * The rule, deliberately narrow:
 *
 *  - Both rows must be REAL Aurora-pull rows: `origin = 'aurora_pull'` with a
 *    non-NULL `aurora_id` that is not one of the JSON importer's synthetic
 *    `json-import-%` surrogates. A native / imported / Kilter-pulled row is
 *    never hidden by this rule.
 *  - Same natural key at the EXACT instant: user, board, climb, angle and a
 *    literally equal `climbed_at`. No tolerance window — Aurora stores at least
 *    second precision and two genuine sends of the same climb at the same angle
 *    in the same second are physically impossible, while two in the same day
 *    are routine (lapping, projecting, warming up). The cross-source claim's
 *    `NATURAL_KEY_TOLERANCE_SECONDS` / offset inference exist to reconcile a
 *    timezone-shifted foreign original and must NOT be reused here: both rows
 *    came from one source through one normaliser, so there is no offset.
 *  - Identical payload on every column `payloadDiffersFromStored`
 *    (packages/aurora-sync/src/sync/apply-user-logbook.ts) compares — mirror,
 *    status, attempt count, quality, difficulty, benchmark, comment. Aurora
 *    stored the same ascent verbatim, so requiring this costs nothing on the
 *    real rows and rules out collapsing a genuine re-log that differs only in,
 *    say, its comment.
 *  - Never when BOTH rows carry a real `kilter_id`: that would hide a second
 *    real Kilter ascent link, the same guard 0166 spells as
 *    `tw.kilter_id IS NULL OR o.kilter_id IS NULL`.
 *
 * The survivor is the row with the lexicographically SMALLEST `aurora_id`.
 * `created_at` is not usable as a tiebreak: co-arriving duplicates are written
 * by one chunked INSERT and share a single `now()`, so the winner would fall
 * out of payload order, and a full re-pull rewrites `created_at` wholesale.
 * `aurora_id` is a stable upstream property, distinct by unique index, and
 * identical on every device and every re-sync.
 *
 * Tombstones come out right for free: if Aurora deletes the survivor, the pull
 * deletes that row, the next-smallest `aurora_id` in the group stops matching a
 * smaller sibling, and the climber still sees exactly one tick.
 */

type TicksTable = typeof boardseshTicks;

/** Surrogate ids minted by the JSON importer — not real upstream Aurora ids. */
const SYNTHETIC_AURORA_ID_PATTERN = 'json-import-%';

/**
 * True for a row that is genuinely owned by the Aurora live pull. Takes the two
 * columns structurally so it accepts both the base table and the self-join
 * alias (drizzle bakes the table name into a column's type).
 */
function isRealAuroraPullRow(ticks: { origin: Column; auroraId: Column }): SQL {
  return and(
    eq(ticks.origin, 'aurora_pull'),
    isNotNull(ticks.auroraId),
    sql`${ticks.auroraId} NOT LIKE ${SYNTHETIC_AURORA_ID_PATTERN}`,
  )!;
}

/**
 * WHERE condition that keeps exactly one row per Aurora-side duplicate group.
 *
 * Composes as a plain condition, so a list query and its count query pick it up
 * from the same shared conditions array and can never disagree about how many
 * ascents there are. Index-backed: the correlated lookup probes
 * `boardsesh_ticks_user_climb_lookup_idx` (user_id, board_type, angle,
 * climb_uuid) with equality on all four columns.
 *
 * @param ticks the ticks table (or an alias of it) the query selects from.
 */
export function notAuroraTwinDuplicate(ticks: TicksTable = boardseshTicks): SQL {
  const twin = alias(boardseshTicks, 'aurora_twin');

  const smallerTwinExists = new QueryBuilder()
    .select({ one: sql`1` })
    .from(twin)
    .where(
      and(
        isRealAuroraPullRow(twin),
        eq(twin.userId, ticks.userId),
        eq(twin.boardType, ticks.boardType),
        eq(twin.climbUuid, ticks.climbUuid),
        eq(twin.angle, ticks.angle),
        // Exact instant. `climbed_at` is `timestamp without time zone` on both
        // sides, written by the same normaliser — a plain `=` is the whole rule.
        eq(twin.climbedAt, ticks.climbedAt),
        // Verbatim payload — same column set as payloadDiffersFromStored.
        sql`COALESCE(${twin.isMirror}, false) = COALESCE(${ticks.isMirror}, false)`,
        eq(twin.status, ticks.status),
        eq(twin.attemptCount, ticks.attemptCount),
        sql`${twin.quality} IS NOT DISTINCT FROM ${ticks.quality}`,
        sql`${twin.difficulty} IS NOT DISTINCT FROM ${ticks.difficulty}`,
        sql`COALESCE(${twin.isBenchmark}, false) = COALESCE(${ticks.isBenchmark}, false)`,
        sql`COALESCE(${twin.comment}, '') = COALESCE(${ticks.comment}, '')`,
        // Survivor = smallest aurora_id. Strict `<` also makes the row-vs-itself
        // comparison false, so a group of one always survives.
        sql`${twin.auroraId} < ${ticks.auroraId}`,
        // Two distinct real Kilter links are two real upstream ascents; hiding
        // one would lose a link. Mirrors migration 0166's twin guard.
        sql`(${twin.kilterId} IS NULL OR ${ticks.kilterId} IS NULL)`,
      ),
    );

  // Non-Aurora-pull rows short-circuit before the correlated lookup runs.
  return or(not(isRealAuroraPullRow(ticks)), notExists(smallerTwinExists))!;
}
