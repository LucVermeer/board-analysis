-- Custom SQL migration file, put your code below! --
--
-- One-off backfill: recompute the denormalized required_set_ids for listed,
-- non-draft catalog climbs where it is NULL. A NULL required_set_ids silently
-- excludes a climb from every set-filtered search (`NULL <@ array` is false), so
-- these climbs exist but can't be found under any hold-set filter.
--
-- These climbs arrived through an ingest path that populated required_set_ids at
-- a moment when their layout's placements weren't yet present (the cross-batch
-- Aurora shared-sync cursor hole) or before the p(\d+)r regex fix in
-- populateDenormalizedColumns — so the frames -> placements join produced nothing
-- and the column stayed NULL. Re-running the SAME join now that placements exist
-- fills them. The code side closes the recurrence: shared-sync healRequiredSetIds
-- drains stragglers at the tail of each run once all placements are present.
--
-- Uses populateDenormalizedColumns' Step-2 SQL verbatim (frames regex ->
-- board_placements.set_id). MoonBoard is excluded — it has no board_placements
-- and derives set ids from a separate cell->set map.
--
-- Prod-verified 2026-07-08 (boardsesh_readonly): 9,230 target rows (kilter 4,815,
-- tension 3,031, grasshopper 945, decoy 439); a sample of 2,000 all resolve to a
-- non-empty set list under the join. compatible_size_ids among these rows: 0 NULL
-- (already populated), so only required_set_ids is healed here.
--
-- Chunked in batches of 2,000 climbs: the per-climb regexp_matches LATERAL fan-out
-- against board_placements is heavy, and a single pass over the whole target set
-- would blow prod's work_mem. Idempotent: the required_set_ids IS NULL guard (both
-- the batch selection and the final UPDATE) makes a re-run a no-op. Each changed
-- row fires trg_board_climbs_set_sync_fields, so healed climbs reach offline
-- clients as a bounded re-pull.

DO $$
DECLARE
  b bigint;
  max_batch bigint;
BEGIN
  CREATE TEMP TABLE _bf_reqset_keys ON COMMIT DROP AS
    SELECT board_type, uuid,
           ((row_number() OVER (ORDER BY board_type, uuid)) - 1) / 2000 AS batch
      FROM board_climbs
     WHERE board_type <> 'moonboard'
       AND is_listed = true
       AND is_draft IS NOT TRUE
       AND required_set_ids IS NULL
       AND frames IS NOT NULL
       AND frames <> '';
  CREATE INDEX ON _bf_reqset_keys (batch);

  SELECT COALESCE(MAX(batch), -1) INTO max_batch FROM _bf_reqset_keys;

  FOR b IN 0..max_batch LOOP
    UPDATE board_climbs c
       SET required_set_ids = sub.sets
      FROM (
        SELECT c2.board_type, c2.uuid,
               ARRAY_AGG(DISTINCT bp.set_id ORDER BY bp.set_id) AS sets
          FROM _bf_reqset_keys k
          JOIN board_climbs c2
            ON c2.board_type = k.board_type AND c2.uuid = k.uuid
          CROSS JOIN LATERAL regexp_matches(c2.frames, 'p(\d+)r', 'g') AS m(hold_id_arr)
          JOIN board_placements bp
            ON bp.id = (m.hold_id_arr[1])::int
           AND bp.board_type = c2.board_type
           AND bp.layout_id = c2.layout_id
         WHERE k.batch = b
         GROUP BY c2.board_type, c2.uuid
      ) sub
     WHERE c.board_type = sub.board_type
       AND c.uuid = sub.uuid
       AND c.required_set_ids IS NULL;
  END LOOP;
END $$;
