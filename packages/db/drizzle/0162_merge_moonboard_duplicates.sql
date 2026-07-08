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
-- ticks and playlist entries, MERGE the group's upstream ascent counts onto the
-- canonical's stats row (policy below), recompute the canonical's boardsesh/total
-- counts, and delist the non-canonical rows so they leave search. Group formation
-- AND member selection are both fenced to catalog rows (user_id IS NULL): a
-- user-created climb sharing a (layout, fingerprint, angle) with catalog rows is
-- never grouped, aliased, delisted, or tick-repointed. (Prod 2026-07-08: 5
-- user-created moonboard climbs exist, 0 currently fall inside a duplicate group —
-- the fence is enforcement, not a data change.) All members being non-owned, the
-- recompute preserves upstream-owned fa/quality/difficulty and only rebuilds
-- ascent counts.
--
-- MERGED-COUNT POLICY (upstream_ascensionist_count on the canonical):
--   * DOUBLE-IMPORT groups — ALL members share one name AND carry an identical
--     upstream count — are the same problem imported twice, so each member's count
--     is a COPY of one real count. Taking SUM would double it; take MAX (= the lone
--     value) instead.
--   * EVERY OTHER group (distinct names, or same name but differing counts) is
--     genuinely separate duplicate entries with independent logbooks -> SUM.
-- This narrows the earlier SUM-everywhere behaviour, which over-counted the
-- double-imports. (ascensionist_count == upstream for these non-owned catalog rows,
-- so keying the identical-count test on upstream matches "identical ascents".)
--
-- Prod-verified 2026-07-08 (boardsesh_readonly): 456 groups / 950 climbs / 494
-- non-canonical; 76 ticks reference non-canonical rows. Merged-count split:
--   * 89 double-import groups -> MAX
--   * 367 genuinely-distinct groups -> SUM (incl. 26 same-name groups whose members
--     carry DIFFERING counts — real separate logbooks, correctly summed)
-- Group SUM-everywhere total was 114,035; the refined policy yields 113,710, i.e.
-- MAX removes 325 double-counted ascents (~0.29%). (A same-name-only MAX — the
-- discarded looser signature — would have collapsed 115 groups and cut 480; the
-- extra 26/155 are the differing-count groups the stricter signature keeps as SUM.)
--
-- NON-IDEMPOTENT: the merge would compound on a re-run (the canonical is itself a
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

  -- Duplicate groups (identical holds at the same angle, >1 member). angle IS NOT
  -- NULL is explicit: GROUP BY treats NULLs as one group, and "same problem" is
  -- only defined at a known angle. (The _mb_members equality join on
  -- g.angle = bc.angle could never actually match a NULL-angle row — NULL = NULL
  -- is not true in a join predicate — but the guard states the intent rather than
  -- leaning on that. Prod 2026-07-08: 0 moonboard rows with NULL angle in either
  -- board_climbs or board_climb_stats.)
  CREATE TEMP TABLE _mb_groups ON COMMIT DROP AS
    SELECT layout_id, hold_fingerprint, angle
      FROM board_climbs
     WHERE board_type = 'moonboard'
       AND user_id IS NULL -- catalog rows only: user content is never grouped
       AND hold_fingerprint IS NOT NULL
       AND hold_fingerprint <> ''
       AND angle IS NOT NULL
     GROUP BY layout_id, hold_fingerprint, angle
    HAVING count(*) > 1;

  -- Group members with their ascent/upstream counts. name is carried so the
  -- merged-count policy below can spot same-name double-imports (see step 4).
  -- user_id IS NULL again on member selection: a user-created climb that happens
  -- to share (layout, fingerprint, angle) with a catalog group must never be
  -- aliased, delisted, or have its ticks repointed by this merge.
  CREATE TEMP TABLE _mb_members ON COMMIT DROP AS
    SELECT bc.uuid, bc.angle, bc.layout_id, bc.hold_fingerprint, bc.created_at,
           lower(bc.name) AS lname,
           COALESCE(s.ascensionist_count, 0)          AS ascents,
           COALESCE(s.upstream_ascensionist_count, 0) AS upstream
      FROM board_climbs bc
      JOIN _mb_groups g
        ON g.layout_id = bc.layout_id
       AND g.hold_fingerprint = bc.hold_fingerprint
       AND g.angle = bc.angle
      LEFT JOIN board_climb_stats s
        ON s.board_type = 'moonboard' AND s.climb_uuid = bc.uuid AND s.angle = bc.angle
     WHERE bc.board_type = 'moonboard'
       AND bc.user_id IS NULL;

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

  -- 4. Merge the group's upstream ascent counts onto the canonical's stats row.
  --    Seed a canonical stats row first in case it was missing.
  INSERT INTO board_climb_stats (board_type, climb_uuid, angle,
                                 ascensionist_count, upstream_ascensionist_count, boardsesh_ascensionist_count)
  SELECT 'moonboard', canonical_uuid, angle, 0, 0, 0 FROM _mb_canon
  ON CONFLICT (board_type, climb_uuid, angle) DO NOTHING;

  --    Merged-count policy (see header): a group whose members ALL share one name
  --    AND carry an identical upstream count is a same-import-twice double-import,
  --    so its per-member counts are copies of ONE real count — take MAX (the single
  --    value), not SUM, or we'd inflate the canonical. Every other group (distinct
  --    names, or same name but differing counts) is genuinely separate duplicate
  --    entries with independent logbooks -> SUM. MAX = the lone value when identical.
  UPDATE board_climb_stats s
     SET upstream_ascensionist_count =
           CASE WHEN grp.distinct_names = 1 AND grp.min_up = grp.max_up
                THEN grp.max_up
                ELSE grp.sum_up END
    FROM _mb_canon c
    JOIN (
      SELECT layout_id, hold_fingerprint, angle,
             SUM(upstream)              AS sum_up,
             MAX(upstream)              AS max_up,
             MIN(upstream)              AS min_up,
             count(DISTINCT lname)      AS distinct_names
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
