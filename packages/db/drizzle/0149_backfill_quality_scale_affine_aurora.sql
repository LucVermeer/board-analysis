-- Custom SQL migration file, put your code below! --
--
-- Re-backfill: correct Aurora-board board_climb_stats.quality_average from the
-- WRONG ×5/3 scaling to the canonical affine scale (2·avg − 1).
--
-- Background
--   convertQuality maps a single Aurora 1-3 rating onto 1-5 with the affine map
--   2q − 1 (1→1, 2→3, 3→5). Because AVG is linear, the correct rescale of an
--   *average* of 1-3 ratings is also 2·avg − 1. But normalizeQualityTo5 (and
--   migration 0116) used ×5/3 instead, which maps [1,3] → [1.67,5] and inflates
--   low-rated climbs by up to +0.67 stars. On prod the Aurora-board histograms
--   sit exactly on the 5q/3 grid (e.g. tension: 5.00, 3.33, 4.17, 4.44, 1.67…).
--
-- The fix, algebraically
--   A stored value was  q_old = q_true × 5/3, so q_true = q_old × 3/5.
--   We want             q_new = 2 × q_true − 1 = 2 × (q_old × 3/5) − 1
--                             = q_old × 6/5 − 1 = 1.2 × q_old − 1.
--   Check: 5.00→5.00 (fixed point), 3.33→3.00, 1.67→1.00. Exactly reverses ×5/3.
--
-- Scope (mirrors 0116, minus kilter which is corrected separately in 0150)
--   * Aurora-scale boards only: tension, decoy, soill, touchstone, grasshopper.
--     MoonBoard quality is native 1-5 (untouched); kilter is a mixed 1-3/1-5
--     Grips blend handled by 0150.
--   * Boardsesh-owned climbs (board_climbs.user_id IS NOT NULL) are excluded:
--     recomputeClimbStats already wrote their quality_average on the 2·avg − 1
--     grid from ticks, so they must NOT be re-scaled. Everything else on these
--     boards was written by the Aurora sync (×5/3), so the whole non-owned,
--     rated population is on the ×5/3 grid — no per-row scale detection needed.
--   * quality_average = 0 ("unrated" sentinel) is skipped here and nulled in the
--     sentinel-cleanup migration (0151). NULL quality is skipped (nothing to do).
--   * quality_average = 5.00 is the fixed point of 1.2q − 1 (the true-3.0 rows),
--     so we skip it (quality_average < 5.0) to avoid ~108k no-op row rewrites;
--     the ×5/3 grid has no legitimate value between its max of 5.0 and 5.0.
--
-- Prod row counts verified read-only (2026-07-07): 208,295 non-owned rated rows
-- on these boards; of those 100,253 are < 5.0 (inflated, rewritten here) and
-- 108,042 sit at the 5.0 fixed point (skipped). quality_normalized was already
-- TRUE on every row (set by 0116), so it is not used to scope this pass.
--
-- Batching: a monotonic key cursor over (board_type, climb_uuid, angle) walks
-- the primary key in pages, so every row is visited exactly once — the update is
-- single-pass and safe to interrupt/retry within this migration (1.2q − 1 is not
-- value-idempotent, so a value-filtered LIMIT loop could double-apply; the key
-- cursor cannot). A big single-statement UPDATE would also work but bloats WAL
-- and holds one long lock — the page loop keeps each statement bounded.

-- Durable double-apply guard (see 0154 for rationale): a guard row makes even
-- a manual psql re-application a no-op.
CREATE TABLE IF NOT EXISTS _bs_migration_guards (
  tag text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE
  v_batch      int := 20000;
  v_bt         text := '';
  v_uuid       text := '';
  v_angle      int := -2147483648;
  v_last_bt    text;
  v_last_uuid  text;
  v_last_angle int;
  v_page_count int;
  v_delta      bigint;
  v_total      bigint := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM _bs_migration_guards WHERE tag = '0149_aurora_quality_affine') THEN
    RAISE NOTICE '0149_aurora_quality_affine already applied — skipping (guard row present)';
    RETURN;
  END IF;

  LOOP
    WITH page AS (
      SELECT s.board_type, s.climb_uuid, s.angle
      FROM board_climb_stats s
      WHERE (s.board_type, s.climb_uuid, s.angle) > (v_bt, v_uuid, v_angle)
        AND s.board_type IN ('tension', 'decoy', 'soill', 'touchstone', 'grasshopper')
      ORDER BY s.board_type, s.climb_uuid, s.angle
      LIMIT v_batch
    ),
    upd AS (
      UPDATE board_climb_stats t
      SET quality_average = 1.2 * t.quality_average - 1.0
      FROM page p
      WHERE t.board_type = p.board_type
        AND t.climb_uuid = p.climb_uuid
        AND t.angle = p.angle
        AND t.quality_average IS NOT NULL
        AND t.quality_average > 0
        AND t.quality_average < 5.0
        AND NOT EXISTS (
          SELECT 1 FROM board_climbs bc
          WHERE bc.board_type = t.board_type
            AND bc.uuid = t.climb_uuid
            AND bc.user_id IS NOT NULL
        )
      RETURNING 1
    ),
    bounds AS (
      SELECT board_type, climb_uuid, angle
      FROM page
      ORDER BY board_type DESC, climb_uuid DESC, angle DESC
      LIMIT 1
    )
    SELECT (SELECT count(*) FROM page),
           (SELECT count(*) FROM upd),
           bounds.board_type, bounds.climb_uuid, bounds.angle
      INTO v_page_count, v_delta, v_last_bt, v_last_uuid, v_last_angle
      FROM bounds;

    EXIT WHEN v_page_count IS NULL OR v_page_count = 0;

    v_total := v_total + COALESCE(v_delta, 0);
    v_bt := v_last_bt;
    v_uuid := v_last_uuid;
    v_angle := v_last_angle;
  END LOOP;

  INSERT INTO _bs_migration_guards (tag) VALUES ('0149_aurora_quality_affine');

  RAISE NOTICE 'aurora quality re-backfill: rescaled % row(s) from x5/3 to 2q-1 (1.2q-1)', v_total;
END $$;
