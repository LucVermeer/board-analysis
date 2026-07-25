-- Custom SQL migration file, put your code below! --
-- Freeze rows a human already curated before sync_frozen_at existed.
-- Any gym/board owned by someone other than the SYSTEM import user was
-- created or claimed by a real user, so it is human-curated: mark it frozen
-- (using updated_at as the best-known curation time) so the location sync can
-- never overwrite it. Idempotent via COALESCE — re-running never moves a stamp.
--
-- LIMITATION (operator-facing): this only backfills owner_id <> SYSTEM rows. A
-- SYSTEM-owned catalog gym/board that a MODERATOR edited BEFORE this migration
-- keeps sync_frozen_at = NULL, because there is no reliable signal that separates
-- a pre-migration moderator fix from a plain sync write without over-freezing the
-- whole catalog. Such rows therefore stay overwritable by the location sync until
-- the next moderator edit re-stamps sync_frozen_at (updateGym / updateBoard do so
-- going forward). In short: freeze protection is retroactive for user-owned rows
-- but GOING-FORWARD-ONLY for moderator-fixed SYSTEM rows. Do not assume every
-- existing moderator fix is protected the moment this migration runs.
UPDATE "gyms"
   SET "sync_frozen_at" = COALESCE("sync_frozen_at", "updated_at")
 WHERE "owner_id" <> '00000000-0000-0000-0000-000000000000';
--> statement-breakpoint
UPDATE "user_boards"
   SET "sync_frozen_at" = COALESCE("sync_frozen_at", "updated_at")
 WHERE "owner_id" <> '00000000-0000-0000-0000-000000000000';
