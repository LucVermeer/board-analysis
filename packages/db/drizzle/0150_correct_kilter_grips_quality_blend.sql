-- Custom SQL migration file, put your code below! --
--
-- Correct Kilter board_climb_stats.quality_average for the mixed-scale Grips
-- blend, matching the correctGripsQualityAverage() ingest function.
--
-- Background
--   The Kilter Grips catalog reports one quality_average per (climb, angle) that
--   is a MIXED blend: legacy Aurora-era ratings on the raw 1-3 scale (Grips
--   inherited Aurora's logbook) plus Grips-era ratings on native 1-5. The sync
--   stored it verbatim, so every Aurora-era classic is pinned near 3 and renders
--   ~3-of-5. On prod 134,990 pre-cutover kilter rows sit at exactly 3.00.
--
-- Rule (identical to correctGripsQualityAverage in kilter-sync/sync/quality-scale.ts)
--   We can't tell a single rating's scale from the aggregate, so we use the
--   climb's era (fa_at on the stat row) as the discriminator:
--     * fa_at < 2025-09-01 (Aurora era) → clamp(2·raw − 1, 1, 5).
--     * fa_at >= cutover, or fa_at NULL (unknown era) → leave as-is (native 1-5).
--     * quality_average <= 0 / NULL → left for the sentinel migration (0151) / skip.
--
-- Known imprecision (best-effort, documented; see PR description)
--   A pre-cutover climb that has since accrued Grips-era 1-5 ratings has a
--   blended average > 3 that this over-converts and clamps to 5. Prod: 49,817
--   pre-cutover kilter rows are in (3, 5) and clamp up to 5.0; 3,229 already at
--   5.0 stay 5.0. This is the accepted trade-off for un-pinning the ~135k
--   Aurora-era classics stuck at 3.0. Only 2 pre-cutover kilter rows are
--   Boardsesh-owned; we exclude them (their quality comes from recomputeClimbStats
--   on the 2·avg − 1 grid already, exactly as 0149 excludes owned aurora rows).
--
-- Prod scope verified read-only (2026-07-07): 312,155 non-owned pre-cutover rated
-- kilter rows are rewritten (the NOT EXISTS scope keeps 45 orphan stat rows with no
-- board_climbs row); post-cutover / unknown-era / unrated rows are untouched. Of
-- these, 134,990 are the classics pinned at exactly 3.00 that become 5.00.
--
-- Batching: monotonic key cursor over (climb_uuid, angle) — every kilter row is
-- visited once, so the (non value-idempotent) 2q − 1 update is single-pass safe.

DO $$
DECLARE
  v_batch      int := 20000;
  v_uuid       text := '';
  v_angle      int := -2147483648;
  v_last_uuid  text;
  v_last_angle int;
  v_page_count int;
  v_delta      bigint;
  v_total      bigint := 0;
BEGIN
  LOOP
    WITH page AS (
      SELECT s.climb_uuid, s.angle
      FROM board_climb_stats s
      WHERE s.board_type = 'kilter'
        AND (s.climb_uuid, s.angle) > (v_uuid, v_angle)
      ORDER BY s.climb_uuid, s.angle
      LIMIT v_batch
    ),
    upd AS (
      UPDATE board_climb_stats t
      SET quality_average = LEAST(5.0, GREATEST(1.0, 2.0 * t.quality_average - 1.0))
      FROM page p
      WHERE t.board_type = 'kilter'
        AND t.climb_uuid = p.climb_uuid
        AND t.angle = p.angle
        AND t.quality_average IS NOT NULL
        AND t.quality_average > 0
        AND t.fa_at IS NOT NULL
        AND t.fa_at < TIMESTAMP '2025-09-01'
        AND NOT EXISTS (
          SELECT 1 FROM board_climbs bc
          WHERE bc.board_type = 'kilter'
            AND bc.uuid = t.climb_uuid
            AND bc.user_id IS NOT NULL
        )
      RETURNING 1
    ),
    bounds AS (
      SELECT climb_uuid, angle
      FROM page
      ORDER BY climb_uuid DESC, angle DESC
      LIMIT 1
    )
    SELECT (SELECT count(*) FROM page),
           (SELECT count(*) FROM upd),
           bounds.climb_uuid, bounds.angle
      INTO v_page_count, v_delta, v_last_uuid, v_last_angle
      FROM bounds;

    EXIT WHEN v_page_count IS NULL OR v_page_count = 0;

    v_total := v_total + COALESCE(v_delta, 0);
    v_uuid := v_last_uuid;
    v_angle := v_last_angle;
  END LOOP;

  RAISE NOTICE 'kilter Grips quality correction: rescaled % pre-cutover row(s) (2q-1, clamped)', v_total;
END $$;
