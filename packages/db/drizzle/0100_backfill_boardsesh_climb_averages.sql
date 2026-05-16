-- Migration: backfill quality_average / difficulty_average / display_difficulty
-- for Boardsesh-originated climbs that already have ticks.
--
-- Context:
--   Migration 0099 split board_climb_stats.ascensionist_count into per-source
--   columns and backfilled boardsesh_ascensionist_count + FA fields, but
--   stopped short of the rating columns. For Boardsesh-originated climbs
--   (board_climbs.user_id IS NOT NULL) the Aurora sync never writes
--   board_climb_stats, so quality_average / difficulty_average /
--   display_difficulty stayed NULL. The UI happily renders the ascent count
--   but cannot show stars or a grade. The runtime recompute in
--   packages/backend/src/graphql/resolvers/ticks/recompute-climb-stats.ts has
--   been extended to write these columns under the same ownership rule
--   (Boardsesh-owned climbs only); this migration brings every existing
--   Boardsesh-owned row up to that state in one pass.
--
-- For Aurora-synced climbs we deliberately do not touch these columns:
--   - Aurora's upsertClimbStats clobbers them on every sync.
--   - Aurora's averages are computed over a much larger ascent population.
--
-- Idempotency: re-running produces the same result because the aggregation
-- is purely a function of the current boardsesh_ticks contents.

WITH boardsesh_owned AS (
  SELECT board_type, uuid AS climb_uuid
    FROM board_climbs
   WHERE user_id IS NOT NULL
),
agg AS (
  SELECT bt.board_type,
         bt.climb_uuid,
         bt.angle,
         AVG(bt.quality)    AS avg_quality,
         AVG(bt.difficulty) AS avg_difficulty
    FROM boardsesh_ticks bt
    JOIN boardsesh_owned bo
      ON bo.board_type = bt.board_type
     AND bo.climb_uuid = bt.climb_uuid
   WHERE bt.status IN ('flash', 'send')
   GROUP BY bt.board_type, bt.climb_uuid, bt.angle
)
UPDATE board_climb_stats s
   SET quality_average    = agg.avg_quality,
       difficulty_average = agg.avg_difficulty,
       display_difficulty = agg.avg_difficulty
  FROM agg
 WHERE s.board_type = agg.board_type
   AND s.climb_uuid = agg.climb_uuid
   AND s.angle      = agg.angle;
