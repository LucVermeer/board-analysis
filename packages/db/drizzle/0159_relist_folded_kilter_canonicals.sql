-- Custom SQL migration file, put your code below! --
--
-- One-off repair: re-list synced kilter canonicals that a currently-LISTED Grips
-- climb folds onto but that we had previously unlisted, leaving the physical
-- climb invisible in search even though it demonstrably exists on the wall again.
--
-- A non-self kilter alias (alias_uuid <> canonical_uuid, source='kilter') is only
-- ever written when a listed, non-draft, non-deleted Grips climb folds by hold
-- fingerprint onto an existing canonical (packages/kilter-sync catalog-sync). So
-- a canonical that (a) is synced (user_id IS NULL), (b) is currently not visible
-- (is_listed IS NOT TRUE — false or NULL; the column is nullable and search
-- filters on is_listed = true, so NULL is exactly as invisible as false), and
-- (c) backs at least one such non-self alias that was seen in the most recent
-- catalog sync, has a currently-LIVE listed alias proving it is back upstream ->
-- re-list it. User-authored canonicals are never touched (the user_id IS NULL
-- guard). Going forward the fold path re-lists inline
-- (shouldRelistFoldedCanonical in catalog-sync.ts, which treats NULL the same
-- way), so this is a one-shot catch-up for the historical backlog.
--
-- LIVENESS GUARD: alias existence alone is not proof of liveness. If a folded
-- Grips climb is later deleted upstream, its non-self alias row is dropped by
-- reconcileDeletions only when deletions are APPLIED (default is report-only), so a
-- stale folding alias can linger and would otherwise resurrect a dead canonical.
-- We can't consult /delteduuids offline, so we require the folding alias to have
-- been seen in ~the latest sync: last_seen_at >= (freshest kilter alias last_seen)
-- - 7 days. This anchors to the data (not wall-clock), so it stays correct even if
-- the last sync ran days before this migration; a folding alias not refreshed
-- within a sync interval is treated as gone-upstream and does NOT re-list.
--
-- Prod-verified 2026-07-08 (boardsesh_readonly): 878 folding non-self kilter
-- aliases -> 837 distinct unlisted synced canonicals (all is_listed=false,
-- is_draft=false); every folding alias last_seen within ~1 day of the freshest
-- kilter alias, so the liveness guard keeps all 837 (0 stale excluded today).
-- 0 rows with is_listed IS NULL exist anywhere in board_climbs, so the IS NOT
-- TRUE form changes no counts — it makes the scope match the visibility rule.
--
-- Idempotent: the is_listed IS NOT TRUE predicate makes a re-run a no-op — an
-- already-re-listed row is not matched again. Each row this UPDATE changes fires
-- trg_board_climbs_set_sync_fields (0144/0146), bumping updated_at/sync_seq so the
-- change reaches offline clients as a bounded, one-time re-pull.

UPDATE board_climbs c
   SET is_listed = true
 WHERE c.board_type = 'kilter'
   AND c.user_id IS NULL
   AND c.is_listed IS NOT TRUE
   AND EXISTS (
     SELECT 1
       FROM board_climb_aliases a
      WHERE a.board_type = 'kilter'
        AND a.canonical_uuid = c.uuid
        AND a.source = 'kilter'
        AND lower(a.alias_uuid) <> lower(a.canonical_uuid)
        AND a.last_seen_at >= (
          SELECT max(last_seen_at) - interval '7 days'
            FROM board_climb_aliases
           WHERE board_type = 'kilter'
        )
   );
