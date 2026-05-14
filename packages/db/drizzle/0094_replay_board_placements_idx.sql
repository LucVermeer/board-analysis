-- Replay the index from 0092_long_demogoblin.sql in case that migration
-- was skipped in prod.
--
-- Background: drizzle's `migrate` runner filters journal entries by
-- `created_at` (not by SQL hash) — `select id, hash, created_at FROM
-- __drizzle_migrations ORDER BY created_at DESC LIMIT 1`, then applies
-- only entries with `when > that`. When PR #2119 was merged then
-- reverted, the original `0092_normal_malcolm_colcord` migration left an
-- orphan tracker row in prod with `created_at = 1778976500000`. The
-- subsequent `0092_long_demogoblin` PR had `when = 1778632284839` —
-- BEFORE the orphan — so its body was never applied in prod even though
-- it landed on main. Same trap was about to swallow the redo (#2138)
-- until we bumped its `when` past the orphan.
--
-- This file re-applies 0092_long_demogoblin's body so the index lands
-- regardless of whether the original ever ran. Idempotent — safe to no-op
-- in any environment that already has it.
CREATE INDEX IF NOT EXISTS "board_placements_board_type_layout_id_set_hole_idx"
  ON "board_placements" USING btree ("board_type","layout_id","id","set_id","hole_id");
