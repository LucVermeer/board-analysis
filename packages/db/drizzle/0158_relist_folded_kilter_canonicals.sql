-- Custom SQL migration file, put your code below! --
--
-- One-off repair: re-list synced kilter canonicals that a currently-LISTED Grips
-- climb folds onto but that we had previously unlisted, leaving the physical
-- climb invisible in search even though it demonstrably exists on the wall again.
--
-- A non-self kilter alias (alias_uuid <> canonical_uuid, source='kilter') is only
-- ever written when a listed, non-draft, non-deleted Grips climb folds by hold
-- fingerprint onto an existing canonical (packages/kilter-sync catalog-sync). So
-- a canonical that (a) is synced (user_id IS NULL), (b) is currently
-- is_listed=false, and (c) backs at least one such non-self alias, has a listed
-- alias proving it is back upstream -> re-list it. User-authored canonicals are
-- never touched (the user_id IS NULL guard). Going forward the fold path re-lists
-- inline (shouldRelistFoldedCanonical in catalog-sync.ts), so this is a one-shot
-- catch-up for the historical backlog.
--
-- Prod-verified 2026-07-08 (boardsesh_readonly): 878 folding non-self kilter
-- aliases -> 837 distinct unlisted synced canonicals (all is_listed=false,
-- is_draft=false); every folding alias last_seen 2026-07 (current sync cycle).
--
-- Idempotent: the is_listed = false predicate makes a re-run a no-op — an
-- already-re-listed row is not matched again. Each row this UPDATE changes fires
-- trg_board_climbs_set_sync_fields (0144/0146), bumping updated_at/sync_seq so the
-- change reaches offline clients as a bounded, one-time re-pull.

UPDATE board_climbs c
   SET is_listed = true
 WHERE c.board_type = 'kilter'
   AND c.user_id IS NULL
   AND c.is_listed = false
   AND EXISTS (
     SELECT 1
       FROM board_climb_aliases a
      WHERE a.board_type = 'kilter'
        AND a.canonical_uuid = c.uuid
        AND a.source = 'kilter'
        AND lower(a.alias_uuid) <> lower(a.canonical_uuid)
   );
