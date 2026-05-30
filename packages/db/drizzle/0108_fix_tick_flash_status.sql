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
-- Idempotent: re-running it is a no-op once both statements have settled.

-- Promote: attempt_count = 1, no earlier tick for same (climb_uuid, angle) → flash
UPDATE boardsesh_ticks t
SET status = 'flash'
WHERE t.status = 'send'
  AND t.attempt_count = 1
  AND NOT EXISTS (
    SELECT 1 FROM boardsesh_ticks earlier
    WHERE earlier.user_id = t.user_id
      AND earlier.climb_uuid = t.climb_uuid
      AND earlier.angle = t.angle
      AND earlier.climbed_at < t.climbed_at
  );
--> statement-breakpoint

-- Demote: any 'flash' with a prior tick is actually a send
UPDATE boardsesh_ticks t
SET status = 'send'
WHERE t.status = 'flash'
  AND EXISTS (
    SELECT 1 FROM boardsesh_ticks earlier
    WHERE earlier.user_id = t.user_id
      AND earlier.climb_uuid = t.climb_uuid
      AND earlier.angle = t.angle
      AND earlier.climbed_at < t.climbed_at
  );
