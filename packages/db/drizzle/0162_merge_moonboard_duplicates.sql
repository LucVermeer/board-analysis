-- Custom SQL migration file, put your code below! --
--
-- One-off conservative merge of duplicate MoonBoard problems via the
-- board_climb_aliases mechanism, exactly like the kilter dedup path. Two
-- MoonBoard rows are treated as the same physical problem only when they share
-- (layout_id, hold_fingerprint, angle) — identical lit holds AT THE SAME ANGLE.
-- Angle is essential: the same holds at 25 vs 40 degrees are different problems on
-- the wall, so grouping without angle would wrongly merge them.
--
-- Per group we pick a canonical (most ascents, tie-break oldest created_at, then
-- uuid), alias every other member onto it (source='moonboard-dedup'), repoint
-- ticks and playlist entries, SUM the group's upstream ascent counts onto the
-- canonical's stats row, recompute the canonical's boardsesh/total counts, and
-- delist the non-canonical rows so they leave search. All members are non-owned
-- (user_id IS NULL), so the recompute preserves upstream-owned fa/quality/difficulty
-- and only rebuilds ascent counts.
--
-- Prod-verified 2026-07-08 (boardsesh_readonly): 456 groups / 950 climbs / 494
-- non-canonical; group upstream sum 114,035; 76 ticks reference non-canonical rows.
--
-- KNOWN LIMITATION (accepted, tracked): 116 of the 456 groups are same-name
-- double-imports whose members carry an identical upstream count, so SUM double-
-- counts them — inflating the merged upstream by ~480 ascents total (~0.4% of the
-- 114,035). SUM is the specified, audit-verified behaviour; the residual is small
-- and confined to the merged (delisted) rows.
--
-- NON-IDEMPOTENT: the SUM would compound on a re-run (the canonical is itself a
-- group member), so a _bs_migration_guard row makes even a manual re-application a
-- no-op. DO NOT run manually without checking the guard.

-- Durable double-apply guard (see 0149/0150/0154): a guard row makes even a manual
-- psql re-application a no-op.
CREATE TABLE IF NOT EXISTS _bs_migration_guards (
  tag text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM _bs_migration_guards WHERE tag = '0162_merge_moonboard_duplicates') THEN
    RAISE NOTICE '0162_merge_moonboard_duplicates already applied — skipping (guard row present)';
    RETURN;
  END IF;

  -- Duplicate groups (identical holds at the same angle, >1 member).
  CREATE TEMP TABLE _mb_groups ON COMMIT DROP AS
    SELECT layout_id, hold_fingerprint, angle
      FROM board_climbs
     WHERE board_type = 'moonboard'
       AND hold_fingerprint IS NOT NULL
       AND hold_fingerprint <> ''
     GROUP BY layout_id, hold_fingerprint, angle
    HAVING count(*) > 1;

  -- Group members with their ascent/upstream counts.
  CREATE TEMP TABLE _mb_members ON COMMIT DROP AS
    SELECT bc.uuid, bc.angle, bc.layout_id, bc.hold_fingerprint, bc.created_at,
           COALESCE(s.ascensionist_count, 0)          AS ascents,
           COALESCE(s.upstream_ascensionist_count, 0) AS upstream
      FROM board_climbs bc
      JOIN _mb_groups g
        ON g.layout_id = bc.layout_id
       AND g.hold_fingerprint = bc.hold_fingerprint
       AND g.angle = bc.angle
      LEFT JOIN board_climb_stats s
        ON s.board_type = 'moonboard' AND s.climb_uuid = bc.uuid AND s.angle = bc.angle
     WHERE bc.board_type = 'moonboard';

  -- Canonical per group: most ascents, tie-break oldest created_at, then uuid.
  CREATE TEMP TABLE _mb_canon ON COMMIT DROP AS
    SELECT DISTINCT ON (layout_id, hold_fingerprint, angle)
           layout_id, hold_fingerprint, angle, uuid AS canonical_uuid
      FROM _mb_members
     ORDER BY layout_id, hold_fingerprint, angle,
              ascents DESC, created_at ASC NULLS LAST, uuid ASC;

  -- Non-canonical member -> canonical uuid.
  CREATE TEMP TABLE _mb_map ON COMMIT DROP AS
    SELECT m.uuid AS alias_uuid, c.canonical_uuid
      FROM _mb_members m
      JOIN _mb_canon c
        ON c.layout_id = m.layout_id
       AND c.hold_fingerprint = m.hold_fingerprint
       AND c.angle = m.angle
     WHERE m.uuid <> c.canonical_uuid;

  -- 1. Alias non-canonical rows onto the canonical.
  INSERT INTO board_climb_aliases (board_type, alias_uuid, canonical_uuid, source)
  SELECT 'moonboard', alias_uuid, canonical_uuid, 'moonboard-dedup' FROM _mb_map
  ON CONFLICT (board_type, alias_uuid) DO NOTHING;

  -- 2. Repoint ticks.
  UPDATE boardsesh_ticks t
     SET climb_uuid = m.canonical_uuid
    FROM _mb_map m
   WHERE t.board_type = 'moonboard'
     AND t.climb_uuid = m.alias_uuid;

  -- 3. Repoint playlist entries (drop collisions under the (playlist_id,
  --    climb_uuid) unique, then repoint survivors).
  DELETE FROM playlist_climbs pc
   USING _mb_map m
   WHERE pc.climb_uuid = m.alias_uuid
     AND EXISTS (
       SELECT 1 FROM playlist_climbs pc2
        WHERE pc2.playlist_id = pc.playlist_id
          AND pc2.climb_uuid = m.canonical_uuid
     );
  UPDATE playlist_climbs pc
     SET climb_uuid = m.canonical_uuid
    FROM _mb_map m
   WHERE pc.climb_uuid = m.alias_uuid;

  -- 4. SUM the group's upstream ascent counts onto the canonical's stats row.
  --    Seed a canonical stats row first in case it was missing.
  INSERT INTO board_climb_stats (board_type, climb_uuid, angle,
                                 ascensionist_count, upstream_ascensionist_count, boardsesh_ascensionist_count)
  SELECT 'moonboard', canonical_uuid, angle, 0, 0, 0 FROM _mb_canon
  ON CONFLICT (board_type, climb_uuid, angle) DO NOTHING;

  UPDATE board_climb_stats s
     SET upstream_ascensionist_count = grp.sum_up
    FROM _mb_canon c
    JOIN (
      SELECT layout_id, hold_fingerprint, angle, SUM(upstream) AS sum_up
        FROM _mb_members
       GROUP BY layout_id, hold_fingerprint, angle
    ) grp
      ON grp.layout_id = c.layout_id
     AND grp.hold_fingerprint = c.hold_fingerprint
     AND grp.angle = c.angle
   WHERE s.board_type = 'moonboard'
     AND s.climb_uuid = c.canonical_uuid
     AND s.angle = c.angle;

  -- 5. Recompute the canonical keys' boardsesh + total counts from the repointed
  --    ticks (non-owned: fa/quality/difficulty untouched; total = new upstream +
  --    boardsesh).
  WITH per_user AS (
    SELECT bt.climb_uuid, bt.angle, bt.user_id,
           bool_or(bt.status IN ('flash','send')) AS has_send,
           bool_or(bt.origin <> 'native' AND bt.status IN ('flash','send')) AS has_upstream
      FROM boardsesh_ticks bt
      JOIN _mb_canon c ON c.canonical_uuid = bt.climb_uuid AND c.angle = bt.angle
     WHERE bt.board_type = 'moonboard'
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
    FROM _mb_canon k
    LEFT JOIN counts c ON c.climb_uuid = k.canonical_uuid AND c.angle = k.angle
   WHERE s.board_type = 'moonboard'
     AND s.climb_uuid = k.canonical_uuid
     AND s.angle = k.angle;

  -- 6. Delist the non-canonical rows.
  UPDATE board_climbs
     SET is_listed = false
   WHERE board_type = 'moonboard'
     AND uuid IN (SELECT alias_uuid FROM _mb_map);

  INSERT INTO _bs_migration_guards (tag) VALUES ('0162_merge_moonboard_duplicates');

  RAISE NOTICE 'moonboard dedup: merged % non-canonical row(s) across % group(s)',
    (SELECT count(*) FROM _mb_map), (SELECT count(*) FROM _mb_groups);
END $$;
