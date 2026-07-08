-- Custom SQL migration file, put your code below! --
--
-- One-off backfill: insert the missing self-aliases (alias_uuid = canonical_uuid
-- = uuid, source='backfill') for synced kilter climbs (user_id IS NULL) that
-- reached the catalog through a path that never wrote one — historically the
-- Aurora shared-sync climb upsert, which does not maintain the alias graph.
--
-- Without a self-alias a climb is invisible to deletion reconciliation:
-- reconcileDeletions resolves Kilter's reported deletions through
-- board_climb_aliases, so an upstream removal of an un-aliased climb was silently
-- ignored and it stayed listed forever. Going forward catalog-sync's identity
-- path self-heals the gap and reconcileDeletions also falls back to a direct
-- board_climbs.uuid match, so this migration is the historical catch-up.
--
-- Prod-verified 2026-07-08 (boardsesh_readonly): 6,038 synced kilter climbs lack
-- a self-alias (4,815 listed, 1,223 unlisted).
--
-- Idempotent: NOT EXISTS filters to the gap and ON CONFLICT (board_type,
-- alias_uuid) DO NOTHING guards the primary key, so a re-run inserts nothing. The
-- ON CONFLICT also protects any board_climbs row that is itself a non-self alias
-- of another canonical — its existing mapping is kept, never overwritten with a
-- self-alias. No _bs_migration_guard needed.

INSERT INTO board_climb_aliases (board_type, alias_uuid, canonical_uuid, source)
SELECT 'kilter', c.uuid, c.uuid, 'backfill'
  FROM board_climbs c
 WHERE c.board_type = 'kilter'
   AND c.user_id IS NULL
   AND NOT EXISTS (
     SELECT 1
       FROM board_climb_aliases a
      WHERE a.board_type = 'kilter'
        AND a.alias_uuid = c.uuid
        AND a.canonical_uuid = c.uuid
   )
ON CONFLICT (board_type, alias_uuid) DO NOTHING;
