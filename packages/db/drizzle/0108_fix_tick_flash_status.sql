-- Backfill: correct boardsesh_ticks.status across the user_id base.
--
-- Context:
--   The Aurora JSON importer wrote `status = 'flash'` whenever Aurora's
--   per-session `count` field was 1 — but Aurora's `count` is attempts inside
--   a single climbed_at session, not "first ever attempt." Any user who had
--   previously attempted or sent the same (climb_uuid, angle) and later sent
--   it in one go was marked as a flash. The runtime importer has been fixed
--   to write a conservative `'send'` and then promote true first-evers via
--   correctFlashStatusForUser. This migration applies the same correction to
--   every existing row across all users in a single pass.
--
-- Expected impact (estimated from production at PR-cut time):
--   boardsesh_ticks total rows:               ~285,328
--   status='flash' before migration:          ~194,121  (inflated — bug)
--   status='send'  before migration:          ~46,525
--   send + attempt_count=1 (promotion pool):  ~27,873
--   Bulk of the work is the demotion: most "flashes" of repeat climbs become sends.
--   We expect 'flash' rows to drop sharply (to the true-first-ever count) and
--   'send' rows to rise correspondingly. No deletes, no schema changes.
--
-- Performance approach:
--   We materialize per-(user_id, climb_uuid, angle) MIN(climbed_at) in a CTE
--   once, then drive both UPDATEs off the CTE via equi-join. This is one full
--   sequential scan + one hash aggregate, not a correlated NOT EXISTS that
--   probes the table once per candidate row. On the existing indexes
--   (boardsesh_ticks_user_climb_lookup_idx covers user_id, board_type, angle,
--   climb_uuid; climbed_at lives in boardsesh_ticks_climbed_at_idx) the
--   aggregate is cheap and the joins use the lookup index.
--
-- Idempotent: re-running it is a no-op once both statements have settled.

-- Promote first-evers: the single tick at MIN(climbed_at) for each
-- (user_id, climb_uuid, angle), if attempt_count=1, becomes a flash.
WITH first_ticks AS (
  SELECT user_id, climb_uuid, angle, MIN(climbed_at) AS first_climbed_at
  FROM boardsesh_ticks
  GROUP BY user_id, climb_uuid, angle
)
UPDATE boardsesh_ticks t
SET status = 'flash'
FROM first_ticks f
WHERE t.user_id = f.user_id
  AND t.climb_uuid = f.climb_uuid
  AND t.angle = f.angle
  AND t.climbed_at = f.first_climbed_at
  AND t.attempt_count = 1
  AND t.status = 'send';
--> statement-breakpoint

-- Demote everything else labeled 'flash' — anything past the first tick of
-- a given (user_id, climb_uuid, angle) is a send, not a flash.
WITH first_ticks AS (
  SELECT user_id, climb_uuid, angle, MIN(climbed_at) AS first_climbed_at
  FROM boardsesh_ticks
  GROUP BY user_id, climb_uuid, angle
)
UPDATE boardsesh_ticks t
SET status = 'send'
FROM first_ticks f
WHERE t.user_id = f.user_id
  AND t.climb_uuid = f.climb_uuid
  AND t.angle = f.angle
  AND t.climbed_at > f.first_climbed_at
  AND t.status = 'flash';
