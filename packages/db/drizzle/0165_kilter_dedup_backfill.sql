-- Custom SQL migration file, put your code below! --
--
-- One-time dedup: merge the kilter-pull duplicate ticks the pre-PR4 adoption bug
-- created. The kilter natural-key adoption matched on climbed_at ±60s, but a
-- pre-existing Aurora/JSON-import tick stored the user's LOCAL wall time
-- relabelled as UTC while Kilter's PowerSync created_at is true UTC — the gap is
-- the user's whole UTC offset, so adoption never matched and every synced Kilter
-- log inserted a duplicate (origin='kilter_pull') alongside the original.
--
-- This migration finds each kilter_pull twin whose (user, board, climb, angle)
-- also carries exactly ONE original (origin native/json_import/aurora_pull,
-- kilter_id still NULL) at a climbed_at gap consistent with a whole-or-half-hour
-- UTC offset (≤14h) or exact equality, moves the twin's Kilter surrogate ids
-- onto that original (so the row stays linked to Kilter), deletes the twin, and
-- recomputes the affected (board, climb, angle) stats.
--
-- Conservative: only an UNAMBIGUOUS 1:1 pair is merged — a twin with >1 candidate
-- original, or an original claimed by >1 twin, is left completely untouched and
-- counted in the RAISE NOTICE. The whole-offset match key + the single-partner
-- rule keep genuinely-distinct sessions (a real second ascent hours later that
-- happens to land near a half-hour multiple) from being merged unless they are
-- the only candidate.
--
-- Prod scope (read-only, re-measured 2026-07-08): 3,147 clean 1:1 kilter twin
-- pairs; 23 ambiguous twins left alone. (Prior 2026-07-07 estimate was ~3,208.)
--
-- This migration is NOT value-idempotent (a second application against fresh
-- post-fix duplicates could merge rows it shouldn't). Safety comes from BOTH the
-- migrator's single transaction + __drizzle_migrations bookkeeping AND a durable
-- _bs_migration_guards row, so even a manual psql re-application is a no-op.
--
-- ⚠️ NEVER run this file manually via psql: outside the migrator's transaction
-- there is nothing but the guard row below to stop a re-application.

CREATE TABLE IF NOT EXISTS _bs_migration_guards (
  tag text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE
  v_clean bigint;
  v_ambiguous bigint;
  b bigint;
  max_batch bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM _bs_migration_guards WHERE tag = '0165_kilter_dedup_backfill') THEN
    RAISE NOTICE '0165 kilter dedup already applied — skipping (guard row present)';
    RETURN;
  END IF;

  -- (1) All matched twin↔original pairs. The offset test: |Δt| ≤ 14h AND Δt is
  -- within 60s of a multiple of 30 minutes (captures whole-, half- and
  -- quarter-hour zones; 0 = exact equality). Only ACTIVE twins (kilter_id NOT
  -- NULL — a detached twin already lost its link) and originals without a
  -- kilter link (so moving the surrogate can't collide on the global unique
  -- index, and we never touch a genuine second Kilter log).
  CREATE TEMP TABLE _kd_pairs ON COMMIT DROP AS
  SELECT tw.id AS twin_id,
         o.id  AS orig_id,
         tw.kilter_id        AS kilter_id,
         tw.kilter_type      AS kilter_type,
         tw.kilter_synced_at AS kilter_synced_at,
         o.board_type,
         o.climb_uuid,
         o.angle
    FROM boardsesh_ticks tw
    JOIN boardsesh_ticks o
      ON o.user_id    = tw.user_id
     AND o.board_type = tw.board_type
     AND o.climb_uuid = tw.climb_uuid
     AND o.angle      = tw.angle
     AND o.id <> tw.id
     AND o.origin IN ('native','json_import','aurora_pull')
     AND o.kilter_id IS NULL
   WHERE tw.origin = 'kilter_pull'
     AND tw.kilter_id IS NOT NULL
     AND abs(EXTRACT(EPOCH FROM (o.climbed_at::timestamptz - tw.climbed_at::timestamptz))) <= 14 * 3600
     AND LEAST(
           abs(EXTRACT(EPOCH FROM (o.climbed_at::timestamptz - tw.climbed_at::timestamptz)))::numeric % 1800,
           1800 - (abs(EXTRACT(EPOCH FROM (o.climbed_at::timestamptz - tw.climbed_at::timestamptz)))::numeric % 1800)
         ) <= 60;

  -- (2) Keep only unambiguous 1:1 components: the twin has exactly one candidate
  -- original AND that original is claimed by exactly one twin.
  CREATE TEMP TABLE _kd_clean ON COMMIT DROP AS
  WITH twin_deg AS (SELECT twin_id, count(*) AS c FROM _kd_pairs GROUP BY twin_id),
       orig_deg AS (SELECT orig_id, count(*) AS c FROM _kd_pairs GROUP BY orig_id)
  SELECT p.*
    FROM _kd_pairs p
    JOIN twin_deg td ON td.twin_id = p.twin_id AND td.c = 1
    JOIN orig_deg od ON od.orig_id = p.orig_id AND od.c = 1;

  SELECT count(*) INTO v_clean FROM _kd_clean;
  SELECT count(DISTINCT twin_id) INTO v_ambiguous
    FROM _kd_pairs WHERE twin_id NOT IN (SELECT twin_id FROM _kd_clean);

  -- (3a) Clear the surrogate on the twins first so moving it onto the original
  -- can't transiently collide on boardsesh_ticks_kilter_id_unique.
  UPDATE boardsesh_ticks t
     SET kilter_id = NULL, kilter_type = NULL, kilter_synced_at = NULL
    FROM _kd_clean c
   WHERE t.id = c.twin_id;

  -- (3b) Stamp the Kilter surrogate onto the surviving original (keep origin —
  -- it records first creation). updated_at bumps so the row re-ships to offline
  -- clients.
  UPDATE boardsesh_ticks t
     SET kilter_id        = c.kilter_id,
         kilter_type      = c.kilter_type,
         kilter_synced_at = c.kilter_synced_at,
         updated_at       = now()
    FROM _kd_clean c
   WHERE t.id = c.orig_id;

  -- (3c) Delete the now-unlinked twins.
  DELETE FROM boardsesh_ticks t USING _kd_clean c WHERE t.id = c.twin_id;

  -- (4) Recompute board_climb_stats for every affected key, chunked to 500,
  -- using the same provenance-aware set-based shape as the live recompute
  -- (packages/db/src/queries/climb-stats/recompute.ts) so the first live
  -- recompute after this migration is a no-op.
  --
  -- The recompute SQL below is a DELIBERATE frozen-in-time copy of that logic
  -- at the moment this migration shipped (same precedent as merged 0157). Do
  -- NOT refactor it to share code with the live recompute: an already-applied
  -- migration's meaning must not mutate when the recompute evolves.
  CREATE TEMP TABLE _kd_keys ON COMMIT DROP AS
    SELECT board_type, climb_uuid, angle,
           ((row_number() OVER (ORDER BY board_type, climb_uuid, angle)) - 1) / 500 AS batch
      FROM (SELECT DISTINCT board_type, climb_uuid, angle FROM _kd_clean) d;

  -- Defensive seed (matches recomputeClimbStatsBulk): ensure a stats row exists
  -- for every affected key before the UPDATE.
  INSERT INTO board_climb_stats (board_type, climb_uuid, angle,
                                 ascensionist_count, upstream_ascensionist_count, boardsesh_ascensionist_count)
  SELECT board_type, climb_uuid, angle, 0, 0, 0 FROM _kd_keys
  ON CONFLICT (board_type, climb_uuid, angle) DO NOTHING;

  SELECT COALESCE(MAX(batch), -1) INTO max_batch FROM _kd_keys;

  FOR b IN 0..max_batch LOOP
    WITH keys AS (
      SELECT board_type, climb_uuid, angle FROM _kd_keys WHERE batch = b
    ),
    per_user AS (
      SELECT bt.board_type, bt.climb_uuid, bt.angle, bt.user_id,
             bool_or(bt.status IN ('flash','send')) AS has_send,
             bool_or(bt.origin <> 'native' AND bt.status IN ('flash','send')) AS has_upstream
        FROM boardsesh_ticks bt
        JOIN keys k
          ON k.board_type = bt.board_type AND k.climb_uuid = bt.climb_uuid AND k.angle = bt.angle
       WHERE bt.kilter_detached_at IS NULL
       GROUP BY bt.board_type, bt.climb_uuid, bt.angle, bt.user_id
    ),
    counts AS (
      SELECT board_type, climb_uuid, angle,
             COUNT(*) FILTER (WHERE has_send AND NOT has_upstream) AS distinct_senders
        FROM per_user
       GROUP BY board_type, climb_uuid, angle
    ),
    sends AS (
      SELECT bt.board_type, bt.climb_uuid, bt.angle,
             MIN(bt.climbed_at)         AS first_at,
             AVG(NULLIF(bt.quality, 0)) AS avg_quality,
             AVG(bt.difficulty)         AS avg_difficulty
        FROM boardsesh_ticks bt
        JOIN keys k
          ON k.board_type = bt.board_type AND k.climb_uuid = bt.climb_uuid AND k.angle = bt.angle
       WHERE bt.status IN ('flash','send')
         AND bt.kilter_detached_at IS NULL
       GROUP BY bt.board_type, bt.climb_uuid, bt.angle
    ),
    first_user AS (
      SELECT DISTINCT ON (bt.board_type, bt.climb_uuid, bt.angle)
             bt.board_type, bt.climb_uuid, bt.angle,
             COALESCE(up.display_name, u.name) AS crown
        FROM boardsesh_ticks bt
        JOIN keys k
          ON k.board_type = bt.board_type AND k.climb_uuid = bt.climb_uuid AND k.angle = bt.angle
        JOIN users u ON u.id = bt.user_id
   LEFT JOIN user_profiles up ON up.user_id = u.id
       WHERE bt.status IN ('flash','send')
         AND bt.kilter_detached_at IS NULL
       ORDER BY bt.board_type, bt.climb_uuid, bt.angle, bt.climbed_at ASC
    )
    UPDATE board_climb_stats s
       SET boardsesh_ascensionist_count = COALESCE(c.distinct_senders, 0),
           ascensionist_count           = COALESCE(s.upstream_ascensionist_count, 0)
                                        + COALESCE(c.distinct_senders, 0),
           fa_username = CASE WHEN owned.boardsesh_owned THEN fu.crown        ELSE s.fa_username END,
           fa_at       = CASE WHEN owned.boardsesh_owned THEN sd.first_at     ELSE s.fa_at END,
           quality_average    = CASE WHEN owned.boardsesh_owned THEN sd.avg_quality    ELSE s.quality_average END,
           quality_normalized = CASE WHEN owned.boardsesh_owned THEN TRUE              ELSE s.quality_normalized END,
           difficulty_average = CASE WHEN owned.boardsesh_owned THEN sd.avg_difficulty ELSE s.difficulty_average END,
           display_difficulty = CASE WHEN owned.boardsesh_owned THEN sd.avg_difficulty ELSE s.display_difficulty END
      FROM keys k
      LEFT JOIN counts c
        ON c.board_type = k.board_type AND c.climb_uuid = k.climb_uuid AND c.angle = k.angle
      LEFT JOIN sends sd
        ON sd.board_type = k.board_type AND sd.climb_uuid = k.climb_uuid AND sd.angle = k.angle
      LEFT JOIN first_user fu
        ON fu.board_type = k.board_type AND fu.climb_uuid = k.climb_uuid AND fu.angle = k.angle
      LEFT JOIN LATERAL (
        SELECT COALESCE(
                 (SELECT bc.user_id IS NOT NULL
                    FROM board_climbs bc
                   WHERE bc.board_type = k.board_type AND bc.uuid = k.climb_uuid),
                 FALSE) AS boardsesh_owned
      ) owned ON TRUE
     WHERE s.board_type = k.board_type
       AND s.climb_uuid = k.climb_uuid
       AND s.angle      = k.angle;
  END LOOP;

  INSERT INTO _bs_migration_guards (tag) VALUES ('0165_kilter_dedup_backfill');

  RAISE NOTICE 'kilter dedup: merged % clean 1:1 twin pair(s); left % ambiguous twin(s) untouched',
    v_clean, v_ambiguous;
END $$;
