-- Custom SQL migration file, put your code below! --
--
-- Step (b) of the quality-blend backfill: for every (board_type, climb_uuid,
-- angle) key with >=1 NATIVE rated flash/send tick, compute the Boardsesh side
-- of the blend (boardsesh_quality_sum / boardsesh_quality_count) and rewrite
-- quality_average with the blend — exactly matching recomputeClimbStatsBulk
-- (packages/db/src/queries/climb-stats/recompute.ts), so the first live recompute
-- after this migration is a no-op.
--
-- Boardsesh vote rule (one vote per climber): each climber's LATEST rated native
-- flash/send tick (max climbed_at, tie-break max id) with quality >= 1 and
-- origin = 'native'. A climber re-ticking does NOT multiply their vote. Imported
-- ratings (aurora_pull / kilter_pull / json_import) are excluded — they are
-- already reflected in upstream_quality_average (seeded by 0168) and would be
-- double-counted otherwise.
--
-- Blend (blendedQualityAverageSql), applied to NON-owned climbs; OWNED climbs
-- (board_climbs.user_id NOT NULL) keep the plain AVG(NULLIF(quality,0)) over all
-- their flash/send ticks, matching the recompute's owned branch:
--   quality_average =
--     (COALESCE(upstream_quality_average * upstream_ascensionist_count, 0)
--      + COALESCE(bs_sum, 0))
--     / NULLIF(COALESCE(CASE WHEN upstream_quality_average IS NOT NULL
--                            THEN upstream_ascensionist_count END, 0)
--              + COALESCE(bs_count, 0), 0)
-- For a manufacturer-unrated non-owned climb (upstream_quality_average NULL,
-- e.g. a MoonBoard problem with no catalog quality) the upstream term drops out
-- and quality_average becomes the pure Boardsesh average — surfacing the rating
-- for the first time. 0168 left upstream_quality_average NULL for exactly those.
--
-- Prod scope (2026-07, read-only) — keys with >=1 native rated flash/send tick:
--   kilter    2,593
--   moonboard   571
--   tension      86
--   decoy         6
--   TOTAL     3,256 keys recomputed.
-- Of these ~45 had quality_average NULL and gain a pure-Boardsesh average
-- (kilter 41, moonboard 2, tension 2); the rest are re-blended in place. Every
-- key has >=1 native rated tick, so boardsesh_quality_count >= 1 and the blend
-- denominator is never zero — no key is blended to NULL.
--
-- VALUE-IDEMPOTENT (no guard): recomputes purely from ticks + the stored
-- upstream terms, so a re-run converges to the same blend. Quality/difficulty
-- ascensionist counts and FA are NOT touched here (0157 owns those).
-- DO NOT RUN MANUALLY (chunked, one-shot backfill).
--
-- Chunked in batches of 2,000 keys (mirrors 0157): a single-pass aggregate over
-- the whole boardsesh_ticks x board_climb_stats join exhausts prod's work_mem /
-- parallel shared memory.
--
-- Offline propagation: every changed row fires trg_board_climb_stats_set_sync_fields
-- (0144/0146), so the re-blended quality reaches offline clients as a bounded
-- one-time re-pull of only the rows this migration changed.

DO $$
DECLARE
  b bigint;
  max_batch bigint;
BEGIN
  -- All keys carrying at least one native rated flash/send tick, numbered into
  -- batches of 2,000.
  CREATE TEMP TABLE _bf_quality_keys ON COMMIT DROP AS
    SELECT board_type, climb_uuid, angle,
           ((row_number() OVER (ORDER BY board_type, climb_uuid, angle)) - 1) / 2000 AS batch
      FROM (
        SELECT DISTINCT board_type, climb_uuid, angle
          FROM boardsesh_ticks
         WHERE origin = 'native'
           AND status IN ('flash','send')
           AND quality IS NOT NULL
           AND quality >= 1
      ) distinct_keys;
  CREATE INDEX ON _bf_quality_keys (batch);

  -- Defensive seed: a stats row must exist for every key (0157 already seeded
  -- all flash/send keys, but ticks can predate a seed / land at a new angle).
  -- A freshly seeded row has upstream_quality_average NULL, so it blends to the
  -- pure Boardsesh average below.
  INSERT INTO board_climb_stats (board_type, climb_uuid, angle,
                                 ascensionist_count, upstream_ascensionist_count, boardsesh_ascensionist_count)
  SELECT board_type, climb_uuid, angle, 0, 0, 0
    FROM _bf_quality_keys
  ON CONFLICT (board_type, climb_uuid, angle) DO NOTHING;

  SELECT COALESCE(MAX(batch), -1) INTO max_batch FROM _bf_quality_keys;

  FOR b IN 0..max_batch LOOP
    WITH keys AS (
      SELECT board_type, climb_uuid, angle FROM _bf_quality_keys WHERE batch = b
    ),
    -- Boardsesh blend numerator/weight: one vote per climber = their LATEST
    -- rated native flash/send tick.
    bs_quality AS (
      SELECT latest.board_type, latest.climb_uuid, latest.angle,
             SUM(latest.quality)::double precision AS bs_quality_sum,
             COUNT(*)::bigint                      AS bs_quality_count
        FROM (
          SELECT DISTINCT ON (bt.board_type, bt.climb_uuid, bt.angle, bt.user_id)
                 bt.board_type, bt.climb_uuid, bt.angle, bt.quality
            FROM boardsesh_ticks bt
            JOIN keys k
              ON k.board_type = bt.board_type AND k.climb_uuid = bt.climb_uuid AND k.angle = bt.angle
           WHERE bt.origin = 'native'
             AND bt.status IN ('flash','send')
             AND bt.quality IS NOT NULL
             AND bt.quality >= 1
           ORDER BY bt.board_type, bt.climb_uuid, bt.angle, bt.user_id, bt.climbed_at DESC, bt.id DESC
        ) latest
       GROUP BY latest.board_type, latest.climb_uuid, latest.angle
    ),
    -- Owned-climb average: plain AVG over ALL flash/send ticks of any origin,
    -- quality = 0 sentinel excluded.
    owned_avg AS (
      SELECT bt.board_type, bt.climb_uuid, bt.angle,
             AVG(NULLIF(bt.quality, 0)) AS avg_quality
        FROM boardsesh_ticks bt
        JOIN keys k
          ON k.board_type = bt.board_type AND k.climb_uuid = bt.climb_uuid AND k.angle = bt.angle
       WHERE bt.status IN ('flash','send')
       GROUP BY bt.board_type, bt.climb_uuid, bt.angle
    )
    UPDATE board_climb_stats s
       -- NULL the blend-input columns for owned climbs (never blended), matching
       -- recomputeClimbStatsBulk so the columns mean the same thing everywhere.
       SET boardsesh_quality_sum   = CASE WHEN owned.boardsesh_owned THEN NULL ELSE bq.bs_quality_sum END,
           boardsesh_quality_count = CASE WHEN owned.boardsesh_owned THEN NULL ELSE NULLIF(bq.bs_quality_count, 0) END,
           quality_average = CASE
             WHEN owned.boardsesh_owned THEN oa.avg_quality
             ELSE (
               (COALESCE(s.upstream_quality_average * s.upstream_ascensionist_count, 0)
                + COALESCE(bq.bs_quality_sum, 0))
               / NULLIF(
                   COALESCE(CASE WHEN s.upstream_quality_average IS NOT NULL
                                 THEN s.upstream_ascensionist_count END, 0)
                   + COALESCE(bq.bs_quality_count, 0),
                   0)
             )
           END,
           quality_normalized = CASE WHEN owned.boardsesh_owned THEN TRUE ELSE s.quality_normalized END
      FROM keys k
      LEFT JOIN bs_quality bq
        ON bq.board_type = k.board_type AND bq.climb_uuid = k.climb_uuid AND bq.angle = k.angle
      LEFT JOIN owned_avg oa
        ON oa.board_type = k.board_type AND oa.climb_uuid = k.climb_uuid AND oa.angle = k.angle
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
END $$;
