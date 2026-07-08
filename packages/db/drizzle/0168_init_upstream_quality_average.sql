-- Custom SQL migration file, put your code below! --
--
-- Step (a) of the quality-blend backfill: initialize board_climb_stats.
-- upstream_quality_average := quality_average for NON-owned climbs (the ones
-- with an upstream/manufacturer source). Before the 0167 column split,
-- quality_average WAS the raw upstream average on synced climbs, so this simply
-- moves that value into its new home. Boardsesh-OWNED climbs
-- (board_climbs.user_id IS NOT NULL) have no upstream side — their
-- quality_average is a plain AVG over ticks — so they stay upstream_quality_average
-- NULL. Rows with quality_average NULL are skipped (nothing to seed).
--
-- Step (b) — boardsesh_quality_sum/count + the blended quality_average — is the
-- separate 0169 migration; splitting keeps this step a pure, cheap column copy.
--
-- Prod scope (2026-07, read-only, non-owned rows with quality_average NOT NULL):
--   kilter    387,009   (387,049 rated rows − 40 owned)
--   moonboard 223,728
--   tension   165,374
--   decoy      10,832
--   TOTAL     786,943 rows seeded; 40 owned rated rows excluded (all kilter).
--
-- NOT VALUE-IDEMPOTENT — guarded. Once 0169 (or any later upstream sync)
-- rewrites quality_average into the blend, quality_average no longer equals the
-- raw upstream value, so a re-run of this copy would poison upstream_quality_average
-- with a blended number (or, on a manufacturer-unrated climb that later accrued
-- Boardsesh votes, with a pure-Boardsesh average). The _bs_migration_guards row
-- makes any re-run — including a manual psql re-application — a hard no-op. The
-- `upstream_quality_average IS NULL` predicate additionally makes a single run
-- crash-safe (a resumed run only touches rows not yet seeded, and at 0168 time
-- quality_average is still the raw upstream value). DO NOT RUN MANUALLY.
--
-- Chunked (20k-key cursor over the (board_type, climb_uuid, angle) PK) because a
-- single-pass UPDATE over ~892k stats rows exceeds prod's 2-minute
-- statement_timeout. Each per-row NOT EXISTS is a board_climbs PK lookup.
--
-- Loop termination: on the terminal page the SELECT ... INTO returns zero rows,
-- and PL/pgSQL then sets every INTO target to NULL (targets never retain their
-- prior values), so `EXIT WHEN v_page_count IS NULL OR v_page_count = 0` always
-- fires — the same pattern as the merged 0150/0157 backfills. A full page whose
-- rows are all skipped by the UPDATE predicates still advances the cursor:
-- `bounds` derives from `page`, not from `upd`.
--
-- Offline propagation: every changed row fires trg_board_climb_stats_set_sync_fields
-- (0144/0146), bumping (updated_at, sync_seq) so the seeded value reaches offline
-- clients as a bounded one-time re-pull of only the rows this migration changed.

-- Durable double-apply guard (see 0150/0154 for rationale).
CREATE TABLE IF NOT EXISTS _bs_migration_guards (
  tag text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE
  v_batch      int := 20000;
  v_board      text := '';
  v_uuid       text := '';
  v_angle      int  := -2147483648;
  v_last_board text;
  v_last_uuid  text;
  v_last_angle int;
  v_page_count int;
  v_delta      bigint;
  v_total      bigint := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM _bs_migration_guards WHERE tag = '0168_init_upstream_quality_average') THEN
    RAISE NOTICE '0168_init_upstream_quality_average already applied — skipping (guard row present)';
    RETURN;
  END IF;

  LOOP
    WITH page AS (
      SELECT s.board_type, s.climb_uuid, s.angle
        FROM board_climb_stats s
       WHERE (s.board_type, s.climb_uuid, s.angle) > (v_board, v_uuid, v_angle)
       ORDER BY s.board_type, s.climb_uuid, s.angle
       LIMIT v_batch
    ),
    upd AS (
      UPDATE board_climb_stats t
         SET upstream_quality_average = t.quality_average
        FROM page p
       WHERE t.board_type = p.board_type
         AND t.climb_uuid = p.climb_uuid
         AND t.angle      = p.angle
         AND t.quality_average IS NOT NULL
         AND t.upstream_quality_average IS NULL
         -- Owned climbs have no upstream side — leave them NULL.
         AND NOT EXISTS (
           SELECT 1 FROM board_climbs bc
            WHERE bc.board_type = t.board_type
              AND bc.uuid       = t.climb_uuid
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
      INTO v_page_count, v_delta, v_last_board, v_last_uuid, v_last_angle
      FROM bounds;

    EXIT WHEN v_page_count IS NULL OR v_page_count = 0;

    v_total := v_total + COALESCE(v_delta, 0);
    v_board := v_last_board;
    v_uuid  := v_last_uuid;
    v_angle := v_last_angle;
  END LOOP;

  INSERT INTO _bs_migration_guards (tag) VALUES ('0168_init_upstream_quality_average');

  RAISE NOTICE 'init upstream_quality_average: seeded % non-owned row(s)', v_total;
END $$;
