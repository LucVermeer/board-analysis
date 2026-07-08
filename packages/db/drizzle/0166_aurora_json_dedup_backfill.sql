-- Custom SQL migration file, put your code below! --
--
-- One-time dedup: merge the aurora-pull duplicate ticks that shadow a
-- JSON-imported or native original. A user who imported their Aurora export
-- (origin='json_import') and later ran a live Aurora sync got a second row
-- (origin='aurora_pull', real Aurora uuid) for the same ascent — the live pull
-- had no cross-source claim, so it inserted a twin instead of linking the
-- existing row. (Native saveAscent rows that never reached Aurora can shadow the
-- same way.)
--
-- This migration finds each aurora_pull twin whose (user, board, climb, angle)
-- also carries exactly ONE original (origin native/json_import, with no real
-- Aurora link — aurora_id NULL or the json-import synthetic) at a climbed_at gap
-- consistent with a whole-or-half-hour UTC offset (≤14h) or exact equality,
-- moves the twin's real Aurora surrogate ids onto that original (replacing any
-- json-import synthetic id), deletes the twin, and recomputes the affected
-- (board, climb, angle) stats.
--
-- Conservative: only an UNAMBIGUOUS 1:1 pair is merged — a twin with >1 candidate
-- original, or an original claimed by >1 twin, is left untouched and counted in
-- the RAISE NOTICE.
--
-- Prod scope (read-only, re-measured 2026-07-08): 631 clean 1:1 aurora twin
-- pairs; ~12 ambiguous twins left alone. (Prior 2026-07-07 estimate was ~612.)
--
-- Ordering: runs AFTER 0165 (kilter dedup). An aurora_pull row can be the
-- ORIGINAL for a kilter twin (0165) and the TWIN here — 0165 merges the kilter
-- surrogate onto the aurora_pull row first, then here that row (if it shadows a
-- json_import/native original) folds into the older original, carrying the
-- kilter link along with the aurora link. The mirror chaining also holds: 0165
-- may stamp a kilter twin directly onto the native/json original this migration
-- then merges an aurora twin onto — so the surviving original ends with BOTH the
-- 0165 kilter surrogate and the 0166 aurora surrogate. (Earlier code skipped this
-- because it required the original's kilter_id to still be NULL; see the
-- original-selection note in step 1.)
--
-- NOT value-idempotent; guarded by _bs_migration_guards + the migrator's
-- transaction. ⚠️ NEVER run manually via psql.

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
  IF EXISTS (SELECT 1 FROM _bs_migration_guards WHERE tag = '0166_aurora_json_dedup_backfill') THEN
    RAISE NOTICE '0166 aurora/json dedup already applied — skipping (guard row present)';
    RETURN;
  END IF;

  -- (1) All matched twin↔original pairs. Twin = a real-Aurora-linked aurora_pull
  -- row; original = a native/json_import row WITHOUT a real Aurora link
  -- (aurora_id NULL or the json-import synthetic), so moving the real
  -- aurora_id can't collide on boardsesh_ticks_aurora_id_unique and we never
  -- touch a genuine second Aurora ascent. Same whole/half-hour offset test as
  -- 0165. The twin also carries any kilter link 0165 merged onto it.
  --
  -- The original is selected purely by being the older native/json_import row of
  -- the aurora pair — NOT gated on kilter_id. 0165 may already have stamped a
  -- kilter link directly onto this same original (a kilter twin folded onto it),
  -- and an earlier over-tight `o.kilter_id IS NULL` guard here silently skipped
  -- exactly those originals, so their aurora twin never merged. We keep that
  -- original's own kilter link (COALESCE prefers `t.*` in step 3b — never
  -- overwritten) and still carry the twin's kilter link when the original has
  -- none. The one case we must NOT fold is when BOTH the original and the aurora
  -- twin independently carry a (distinct) kilter link: dropping the twin would
  -- lose one real kilter ascent, so `tw.kilter_id IS NULL OR o.kilter_id IS NULL`
  -- leaves those untouched. (Prod overlap of the whole chained class was 0 on the
  -- one-time run — re-measured 2026-07-08 — so this is latent-correctness only.)
  CREATE TEMP TABLE _ad_pairs ON COMMIT DROP AS
  SELECT tw.id AS twin_id,
         o.id  AS orig_id,
         tw.aurora_id        AS aurora_id,
         tw.aurora_type      AS aurora_type,
         tw.aurora_synced_at AS aurora_synced_at,
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
     AND o.origin IN ('native','json_import')
     AND (o.aurora_id IS NULL OR o.aurora_id LIKE 'json-import-%')
     AND (tw.kilter_id IS NULL OR o.kilter_id IS NULL)
   WHERE tw.origin = 'aurora_pull'
     AND tw.aurora_id IS NOT NULL
     AND tw.aurora_id NOT LIKE 'json-import-%'
     AND abs(EXTRACT(EPOCH FROM (o.climbed_at::timestamptz - tw.climbed_at::timestamptz))) <= 14 * 3600
     AND LEAST(
           abs(EXTRACT(EPOCH FROM (o.climbed_at::timestamptz - tw.climbed_at::timestamptz)))::numeric % 1800,
           1800 - (abs(EXTRACT(EPOCH FROM (o.climbed_at::timestamptz - tw.climbed_at::timestamptz)))::numeric % 1800)
         ) <= 60;

  -- (2) Unambiguous 1:1 components only.
  CREATE TEMP TABLE _ad_clean ON COMMIT DROP AS
  WITH twin_deg AS (SELECT twin_id, count(*) AS c FROM _ad_pairs GROUP BY twin_id),
       orig_deg AS (SELECT orig_id, count(*) AS c FROM _ad_pairs GROUP BY orig_id)
  SELECT p.*
    FROM _ad_pairs p
    JOIN twin_deg td ON td.twin_id = p.twin_id AND td.c = 1
    JOIN orig_deg od ON od.orig_id = p.orig_id AND od.c = 1;

  SELECT count(*) INTO v_clean FROM _ad_clean;
  SELECT count(DISTINCT twin_id) INTO v_ambiguous
    FROM _ad_pairs WHERE twin_id NOT IN (SELECT twin_id FROM _ad_clean);

  -- (3a) Clear the surrogates on the twins first so moving them onto the
  -- original can't transiently collide on the aurora_id / kilter_id unique
  -- indexes.
  UPDATE boardsesh_ticks t
     SET aurora_id = NULL, aurora_type = NULL, aurora_synced_at = NULL,
         kilter_id = NULL, kilter_type = NULL, kilter_synced_at = NULL
    FROM _ad_clean c
   WHERE t.id = c.twin_id;

  -- (3b) Stamp the real Aurora surrogate onto the surviving original, replacing
  -- its json-import synthetic id. Keep origin. The kilter columns COALESCE with
  -- `t.*` FIRST so an existing kilter link on the original (0165 may have stamped
  -- one) is NEVER overwritten — only the aurora_* fields truly move. When the
  -- original has no kilter link, the twin's inherited link (0165 → this row)
  -- still carries over. The step-1 `tw.kilter_id IS NULL OR o.kilter_id IS NULL`
  -- guard guarantees at most one side is set, so no distinct kilter link is lost.
  UPDATE boardsesh_ticks t
     SET aurora_id        = c.aurora_id,
         aurora_type      = c.aurora_type,
         aurora_synced_at = c.aurora_synced_at,
         aurora_sync_error = NULL,
         kilter_id        = COALESCE(t.kilter_id, c.kilter_id),
         kilter_type      = COALESCE(t.kilter_type, c.kilter_type),
         kilter_synced_at = COALESCE(t.kilter_synced_at, c.kilter_synced_at),
         updated_at       = now()
    FROM _ad_clean c
   WHERE t.id = c.orig_id;

  -- (3c) Delete the now-unlinked twins.
  DELETE FROM boardsesh_ticks t USING _ad_clean c WHERE t.id = c.twin_id;

  -- (4) Recompute board_climb_stats for every affected key, chunked to 500,
  -- using the same provenance-aware set-based shape as the live recompute.
  --
  -- The recompute SQL below (and its duplicate in 0165) is a DELIBERATE
  -- frozen-in-time copy of packages/db/src/queries/climb-stats/recompute.ts at
  -- the moment this migration shipped (same precedent as merged 0157). Do NOT
  -- refactor it to share code with the live recompute or with 0165: an
  -- already-applied migration's meaning must not mutate when the recompute
  -- evolves.
  CREATE TEMP TABLE _ad_keys ON COMMIT DROP AS
    SELECT board_type, climb_uuid, angle,
           ((row_number() OVER (ORDER BY board_type, climb_uuid, angle)) - 1) / 500 AS batch
      FROM (SELECT DISTINCT board_type, climb_uuid, angle FROM _ad_clean) d;

  -- Defensive seed (matches recomputeClimbStatsBulk): ensure a stats row exists
  -- for every affected key before the UPDATE.
  INSERT INTO board_climb_stats (board_type, climb_uuid, angle,
                                 ascensionist_count, upstream_ascensionist_count, boardsesh_ascensionist_count)
  SELECT board_type, climb_uuid, angle, 0, 0, 0 FROM _ad_keys
  ON CONFLICT (board_type, climb_uuid, angle) DO NOTHING;

  SELECT COALESCE(MAX(batch), -1) INTO max_batch FROM _ad_keys;

  FOR b IN 0..max_batch LOOP
    WITH keys AS (
      SELECT board_type, climb_uuid, angle FROM _ad_keys WHERE batch = b
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

  INSERT INTO _bs_migration_guards (tag) VALUES ('0166_aurora_json_dedup_backfill');

  RAISE NOTICE 'aurora/json dedup: merged % clean 1:1 twin pair(s); left % ambiguous twin(s) untouched',
    v_clean, v_ambiguous;
END $$;
