-- Migration: Backfill board_climb_stats for Boardsesh-originated climbs.
--
-- Context:
--   The global climbs search hot path INNER JOINs board_climb_stats
--   (see search-climbs.ts:statsDrivenSearch). Historically every row in
--   board_climb_stats came from the Aurora sync pipeline, so climbs
--   originated by Boardsesh users (via the saveClimb GraphQL mutation
--   on Kilter/Tension, or saveMoonBoardClimb without a user grade) had
--   no stats row and were silently excluded from search — even though
--   they showed up on the setter's profile, which uses a LEFT JOIN.
--
--   The application code now seeds a stats row at climb-create time, so
--   only the historical backlog needs cleaning up. This migration handles
--   that one-time fix.
--
-- What this does:
--   For every published (is_listed=TRUE, is_draft=FALSE), user-originated
--   (user_id IS NOT NULL) climb that has no matching board_climb_stats row
--   at its angle, insert a minimal stats row with ascensionist_count=0 and
--   NULL difficulty/quality fields.
--
-- Safety / idempotency:
--   - Drafts are deliberately skipped — they're routed to standardSearch
--     (LEFT JOIN) and would just bloat the table.
--   - ON CONFLICT DO NOTHING means re-running is a no-op.
--   - Only inserts; never updates an existing row.

INSERT INTO board_climb_stats (
  board_type,
  climb_uuid,
  angle,
  ascensionist_count,
  display_difficulty,
  benchmark_difficulty,
  difficulty_average,
  quality_average,
  fa_username,
  fa_at
)
SELECT
  bc.board_type,
  bc.uuid,
  bc.angle,
  0,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM board_climbs bc
LEFT JOIN board_climb_stats bcs
  ON bcs.board_type = bc.board_type
 AND bcs.climb_uuid = bc.uuid
 AND bcs.angle      = bc.angle
WHERE bc.is_listed    = TRUE
  AND bc.is_draft     = FALSE
  AND bc.user_id      IS NOT NULL
  AND bc.angle        IS NOT NULL
  AND bcs.climb_uuid  IS NULL
ON CONFLICT (board_type, climb_uuid, angle) DO NOTHING;
