-- Custom SQL migration file, put your code below! --
--
-- MoonBoard app-catalog data does not carry authoritative first-ascent fields.
-- The catalog importer inserts fa_username/fa_at as NULL and leaves existing FA
-- fields untouched on conflict. A pre-0157 tick recompute derived FA crowns from
-- Boardsesh ticks on manufacturer climbs; 0157 cleared only exact earliest-tick
-- matches, leaving rows whose fa_at drifted after earlier imported ticks arrived.
--
-- Prod preflight (2026-07-09, read-only): 428 MoonBoard stats rows still carry
-- FA fields, all catalog/manufacturer rows; 0 Boardsesh-owned MoonBoard rows.
-- Clear only non-owned rows so user-created MoonBoard climbs keep the generic
-- owned-climb invariant: their FA can be derived from ticks by recompute.
--
-- Offline propagation is handled by trg_board_climb_stats_set_sync_fields
-- (0144/0146) for rows whose FA fields actually change. Do not stamp
-- updated_at/sync_seq manually.

UPDATE board_climb_stats s
   SET fa_username = NULL,
       fa_at       = NULL
 WHERE s.board_type = 'moonboard'
   AND (s.fa_username IS NOT NULL OR s.fa_at IS NOT NULL)
   AND NOT EXISTS (
     SELECT 1
       FROM board_climbs bc
      WHERE bc.board_type = s.board_type
        AND bc.uuid       = s.climb_uuid
        AND bc.user_id IS NOT NULL
   );
