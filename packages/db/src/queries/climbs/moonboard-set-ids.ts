import { sql, type SQL } from 'drizzle-orm';
import { MOONBOARD_CELL_SETS } from '@boardsesh/board-config';

/**
 * Populate `required_set_ids` on MoonBoard `board_climbs`.
 *
 * MoonBoard climbs store holds as grid cells (`frames` = `p{holdId}r{role}`),
 * but — unlike Aurora — there are no `board_placements` rows mapping a cell to
 * its hold set. The cell -> set map lives in @boardsesh/board-config
 * (MOONBOARD_CELL_SETS, derived from the per-set board art). We inline it as a
 * VALUES CTE and aggregate the distinct sets each climb's holds occupy, matching
 * Aurora's `required_set_ids` semantics so the existing `<@` filter works.
 *
 * A climb whose holds all fall on uncovered cells gets `'{}'` (no required set,
 * always shown) rather than NULL, so the non-NULL filter path keeps it visible.
 *
 * Pass `climbUuids` to scope the update to specific climbs (the create-climb
 * path); omit it to recompute every MoonBoard climb (the backfill).
 */
export async function populateMoonBoardRequiredSetIds(
  db: { execute: (query: SQL) => Promise<unknown> },
  climbUuids?: string[],
): Promise<void> {
  if (climbUuids && climbUuids.length === 0) return;

  // Inline the cell->set map as raw SQL rather than thousands of bind params.
  // This is injection-safe ONLY because every value is coerced with Number()
  // below and the source (MOONBOARD_CELL_SETS) is a generated constant, never
  // user input — keep both invariants if this is ever changed.
  const valueRows: string[] = [];
  for (const [layoutId, cells] of Object.entries(MOONBOARD_CELL_SETS)) {
    for (const [holdId, setId] of Object.entries(cells)) {
      valueRows.push(`(${Number(layoutId)},${Number(holdId)},${setId})`);
    }
  }
  const cellSetValues = sql.raw(valueRows.join(','));

  // The regex 'p(\d+)r' must be written with a doubled backslash in source — a
  // JS string literal silently drops the backslash before `\d`. (Same gotcha as
  // populate-denormalized-columns.ts.)
  const holdIdRegex = 'p(\\d+)r';

  const uuidScope = climbUuids
    ? sql`AND c2.uuid = ANY(ARRAY[${sql.join(
        climbUuids.map((uuid) => sql`${uuid}`),
        sql`, `,
      )}]::text[])`
    : sql``;

  await db.execute(sql`
    WITH cell_set(layout_id, hold_id, set_id) AS (
      VALUES ${cellSetValues}
    )
    UPDATE board_climbs c
    SET required_set_ids = COALESCE(sub.sets, '{}')
    FROM (
      SELECT c2.uuid,
        ARRAY_AGG(DISTINCT cs.set_id ORDER BY cs.set_id) FILTER (WHERE cs.set_id IS NOT NULL) AS sets
      FROM board_climbs c2
      CROSS JOIN LATERAL regexp_matches(c2.frames, ${holdIdRegex}, 'g') AS m(hold_id_arr)
      LEFT JOIN cell_set cs
        ON cs.layout_id = c2.layout_id
        AND cs.hold_id = (m.hold_id_arr[1])::int
      WHERE c2.board_type = 'moonboard'
        AND c2.frames IS NOT NULL
        AND c2.frames != ''
        ${uuidScope}
      GROUP BY c2.uuid
    ) sub
    WHERE c.uuid = sub.uuid AND c.board_type = 'moonboard'
  `);
}
