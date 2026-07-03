-- Migration: Rescale boardsesh_ticks.quality for JSON-logbook-imported rows (issue #3390).
--
-- Context:
--   boardsesh_ticks.quality is a 1-5 scale. The JSON logbook-import path
--   (packages/aurora-sync/src/sync/json-import.ts) stored the export's raw
--   `stars` field verbatim on the false assumption it was already 1-5; it is
--   actually the raw Aurora 0-3 rating, same as the API `quality` field.
--   Migration 0079 deliberately skipped 'json-import-%' rows for the same
--   (false) reason, so ~235k rows sit on the wrong scale. A climb rated
--   3-of-3 ("classic") renders as 3-of-5 ("mediocre").
--
--   The import path now runs stars through convertQuality (0 -> NULL,
--   1 -> 1, 2 -> 3, 3 -> 5); this migration applies the same mapping to the
--   rows imported before the fix.
--
-- Safety (mirrors 0079):
--   - Scoped by source: only aurora_type = 'ascents' rows whose aurora_id
--     carries the deterministic 'json-import-' prefix. A raw 3 is otherwise
--     indistinguishable from a correctly-converted 3.
--   - User edits preserved: updateTick bumps updated_at but never
--     aurora_synced_at, while json-import writes both from the same
--     timestamp — so updated_at <= aurora_synced_at selects exactly the
--     untouched rows. (Prod pre-flight 2026-07-03: the only 13 edited rows
--     are also the only rows above 3.) Residue: a row whose comment was
--     edited but not its quality keeps the raw value — same accepted
--     trade-off as 0079.
--   - Idempotent: the CASE alone is not (a converted 2 -> 3 would re-fire
--     3 -> 5 on a second run), but SET updated_at = now() pushes converted
--     rows out of the updated_at <= aurora_synced_at guard, so a re-run is
--     a no-op.
--   - quality = 1 maps to 1 (no-op, skipped); 4/5 are already valid 1-5
--     values (user-edited) and are left alone. quality = 0 is raw
--     "unrated" and becomes NULL, matching convertQuality.
--
-- Detection invariant after this migration: an untouched aurora-synced
-- ascent (updated_at <= aurora_synced_at) can only hold quality NULL, 1, 3
-- or 5. Any 0/2/4 there means a writer is bypassing convertQuality again.
--
-- The second statement re-derives board_climb_stats.quality_average for
-- Boardsesh-owned climbs (board_climbs.user_id IS NOT NULL) that have
-- json-imported ascents: recomputeClimbStats derives their average from
-- AVG(boardsesh_ticks.quality) over flash/send ticks, so averages computed
-- while those ticks were raw are stale-low (66 such ticks in prod).
-- Aurora-synced climbs keep Aurora's own aggregate, exactly like
-- recomputeClimbStats does.

DO $$
DECLARE
  rescaled_count integer;
  stats_count integer;
BEGIN
  UPDATE boardsesh_ticks
  SET
    quality = CASE quality
      WHEN 0 THEN NULL -- raw "unrated"
      WHEN 2 THEN 3
      WHEN 3 THEN 5
      ELSE quality
    END,
    updated_at = now()
  WHERE aurora_type = 'ascents'
    AND aurora_id LIKE 'json-import-%'
    AND quality IN (0, 2, 3)
    AND aurora_synced_at IS NOT NULL
    AND updated_at <= aurora_synced_at;

  GET DIAGNOSTICS rescaled_count = ROW_COUNT;
  RAISE NOTICE 'Rescaled % json-imported tick quality rows from raw 0-3 to 1-5', rescaled_count;

  UPDATE board_climb_stats s
  SET
    quality_average = agg.avg_quality,
    quality_normalized = TRUE
  FROM (
    SELECT bt.board_type, bt.climb_uuid, bt.angle, AVG(bt.quality) AS avg_quality
    FROM boardsesh_ticks bt
    WHERE bt.status IN ('flash', 'send')
      AND (bt.board_type, bt.climb_uuid, bt.angle) IN (
        SELECT DISTINCT ji.board_type, ji.climb_uuid, ji.angle
        FROM boardsesh_ticks ji
        JOIN board_climbs bc
          ON bc.board_type = ji.board_type
         AND bc.uuid = ji.climb_uuid
        WHERE ji.aurora_type = 'ascents'
          AND ji.aurora_id LIKE 'json-import-%'
          AND bc.user_id IS NOT NULL
      )
    GROUP BY bt.board_type, bt.climb_uuid, bt.angle
  ) agg
  WHERE s.board_type = agg.board_type
    AND s.climb_uuid = agg.climb_uuid
    AND s.angle = agg.angle;

  GET DIAGNOSTICS stats_count = ROW_COUNT;
  RAISE NOTICE 'Recomputed quality_average for % Boardsesh-owned climb stats rows', stats_count;
END $$;
