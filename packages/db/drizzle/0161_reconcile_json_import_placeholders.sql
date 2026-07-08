-- Custom SQL migration file, put your code below! --
--
-- One-off reconciliation of the listed json-import placeholder climbs (uuid
-- 'json-import-climb-*') that the importer created for published-but-uncatalogued
-- climbs. Each listed placeholder is a duplicate catalog entry polluting search.
-- Going forward the importer creates these UNLISTED (json-import.ts isListed:false),
-- so this only cleans up the existing backlog.
--
-- For every listed placeholder that resolves to EXACTLY ONE listed real catalog
-- climb by (board_type, layout_id, lower(name)) — user_id IS NULL, non-draft,
-- non-placeholder — we:
--   1. repoint boardsesh_ticks.climb_uuid to the real uuid,
--   2. repoint playlist_climbs.climb_uuid (deleting a placeholder row that would
--      collide with an existing real row under the (playlist_id, climb_uuid) unique),
--   3. recompute board_climb_stats for both keys, and
--   4. delist the placeholder (is_listed=false).
-- Placeholders with 0 candidates or >1 candidate are LEFT untouched and counted
-- in a RAISE NOTICE — repointing them would guess.
--
-- All real candidates are non-owned catalog climbs (user_id IS NULL), so the
-- recompute below preserves upstream-owned fa/quality/difficulty verbatim and only
-- rebuilds the boardsesh/total ascent counts — exactly what recomputeClimbStatsBulk
-- does for a non-owned key. The repointed placeholder ticks are origin='json_import'
-- (already inside upstream), so they never add to the boardsesh count; if a user
-- had both a native and an imported tick, the recompute now (correctly) drops their
-- native double-count on the real climb.
--
-- Prod-verified 2026-07-08 (boardsesh_readonly): 2,008 listed kilter placeholders
-- -> 868 reconcilable (exactly one candidate), 89 ambiguous (multi-candidate),
-- 1,051 unmatched. 82 ticks / 995 playlist rows reference placeholders.
--
-- Idempotent: the reconcilable set is built from is_listed=true placeholders, so a
-- re-run (placeholders now delisted) finds none and does nothing. Tick/playlist
-- repoint and the recompute are each guarded/set-based, so a partial re-run is safe.

DO $$
DECLARE
  v_reconcilable int;
  v_ambiguous    int;
  v_unmatched    int;
BEGIN
  -- Candidate counts per listed placeholder (lower(name) match on both sides).
  CREATE TEMP TABLE _ph_cand ON COMMIT DROP AS
    SELECT p.uuid AS ph_uuid,
           MIN(r.uuid) AS real_uuid,
           COUNT(r.uuid) AS n
      FROM (
        SELECT uuid, layout_id, lower(name) AS lname
          FROM board_climbs
         WHERE board_type = 'kilter'
           AND uuid LIKE 'json-import-climb-%'
           AND is_listed = true
      ) p
      LEFT JOIN board_climbs r
        ON r.board_type = 'kilter'
       AND r.layout_id = p.layout_id
       AND lower(r.name) = p.lname
       AND r.uuid NOT LIKE 'json-import-climb-%'
       AND r.is_listed = true
       AND r.is_draft IS NOT TRUE
       AND r.user_id IS NULL
     GROUP BY p.uuid;

  SELECT COUNT(*) FILTER (WHERE n = 1),
         COUNT(*) FILTER (WHERE n > 1),
         COUNT(*) FILTER (WHERE n = 0)
    INTO v_reconcilable, v_ambiguous, v_unmatched
    FROM _ph_cand;

  -- The reconcilable placeholder -> real uuid map.
  CREATE TEMP TABLE _ph_map ON COMMIT DROP AS
    SELECT ph_uuid, real_uuid FROM _ph_cand WHERE n = 1;

  -- Keys whose stats need recomputing: both the placeholder (loses its ticks) and
  -- the real climb (gains them). Captured from the current tick placement.
  CREATE TEMP TABLE _ph_keys ON COMMIT DROP AS
    SELECT DISTINCT climb_uuid, angle FROM (
      SELECT t.climb_uuid, t.angle
        FROM boardsesh_ticks t JOIN _ph_map m ON m.ph_uuid = t.climb_uuid
       WHERE t.board_type = 'kilter'
      UNION
      SELECT m.real_uuid AS climb_uuid, t.angle
        FROM boardsesh_ticks t JOIN _ph_map m ON m.ph_uuid = t.climb_uuid
       WHERE t.board_type = 'kilter'
    ) k;

  -- 1. Repoint ticks.
  UPDATE boardsesh_ticks t
     SET climb_uuid = m.real_uuid
    FROM _ph_map m
   WHERE t.board_type = 'kilter'
     AND t.climb_uuid = m.ph_uuid;

  -- 2. Repoint playlist entries. Drop a placeholder row that would collide with an
  --    existing real row for the same playlist, then repoint the survivors.
  DELETE FROM playlist_climbs pc
   USING _ph_map m
   WHERE pc.climb_uuid = m.ph_uuid
     AND EXISTS (
       SELECT 1 FROM playlist_climbs pc2
        WHERE pc2.playlist_id = pc.playlist_id
          AND pc2.climb_uuid = m.real_uuid
     );
  UPDATE playlist_climbs pc
     SET climb_uuid = m.real_uuid
    FROM _ph_map m
   WHERE pc.climb_uuid = m.ph_uuid;

  -- 3. Seed + recompute both keys (non-owned: preserve upstream fa/quality/diff,
  --    rebuild boardsesh + total counts only).
  INSERT INTO board_climb_stats (board_type, climb_uuid, angle,
                                 ascensionist_count, upstream_ascensionist_count, boardsesh_ascensionist_count)
  SELECT 'kilter', k.climb_uuid, k.angle, 0, 0, 0
    FROM _ph_keys k
  ON CONFLICT (board_type, climb_uuid, angle) DO NOTHING;

  WITH per_user AS (
    SELECT bt.climb_uuid, bt.angle, bt.user_id,
           bool_or(bt.status IN ('flash','send')) AS has_send,
           bool_or(bt.origin <> 'native' AND bt.status IN ('flash','send')) AS has_upstream
      FROM boardsesh_ticks bt
      JOIN _ph_keys k ON k.climb_uuid = bt.climb_uuid AND k.angle = bt.angle
     WHERE bt.board_type = 'kilter'
     GROUP BY bt.climb_uuid, bt.angle, bt.user_id
  ),
  counts AS (
    SELECT climb_uuid, angle,
           COUNT(*) FILTER (WHERE has_send AND NOT has_upstream) AS distinct_senders
      FROM per_user
     GROUP BY climb_uuid, angle
  )
  UPDATE board_climb_stats s
     SET boardsesh_ascensionist_count = COALESCE(c.distinct_senders, 0),
         ascensionist_count = COALESCE(s.upstream_ascensionist_count, 0) + COALESCE(c.distinct_senders, 0)
    FROM _ph_keys k
    LEFT JOIN counts c ON c.climb_uuid = k.climb_uuid AND c.angle = k.angle
   WHERE s.board_type = 'kilter'
     AND s.climb_uuid = k.climb_uuid
     AND s.angle = k.angle;

  -- 4. Delist the reconciled placeholders.
  UPDATE board_climbs
     SET is_listed = false
   WHERE board_type = 'kilter'
     AND uuid IN (SELECT ph_uuid FROM _ph_map);

  RAISE NOTICE 'json-import placeholder reconcile: % reconciled+delisted, % ambiguous (left), % unmatched (left)',
    v_reconcilable, v_ambiguous, v_unmatched;
END $$;
