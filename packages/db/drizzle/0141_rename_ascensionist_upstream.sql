-- Collapse the two per-backend ascensionist source columns into ONE upstream source.
--
-- Background: board_climb_stats.ascensionist_count is a materialized total that
--   each writer keeps in sync alongside its own source column. Pre-split the
--   upstream was owned per Kilter backend: the total was
--   GREATEST(kilter_ascensionist_count, aurora_ascensionist_count) + boardsesh
--   (aurora_ and kilter_ are two snapshots of the SAME Kilter ascents, so they
--   were max'd, not summed). The MoonBoard importer, having no source column,
--   wrote its community-repeat count straight into ascensionist_count, so the
--   Boardsesh tick recompute (GREATEST(kilter,aurora)+boardsesh -> 0+boardsesh)
--   erased it: in prod 377/378 ticked MoonBoard-2024 climbs collapsed to their
--   tick count (e.g. Birthday Cake Trail Mix 38,683 -> 3).
--
-- Change: one upstream_ascensionist_count per board (the manufacturer's own
--   count) that Boardsesh ADDS on top of, so the total everywhere becomes
--   COALESCE(upstream,0) + COALESCE(boardsesh,0).
--     (1) RENAME aurora_ascensionist_count -> upstream_ascensionist_count
--         (data-preserving; keeps the Tension/Aurora counts and every Kilter
--          row's aurora snapshot).
--     (2) FOLD the kilter snapshot into upstream via GREATEST so no Kilter row
--         loses its higher count, then DROP the now-redundant kilter column.
--
-- Note: MoonBoard rows keep their (possibly already-wiped) ascensionist_count as
--   is here; they are repaired out-of-band by re-running db:import-moonboard-catalog
--   after deploy, which populates upstream from the app catalog and rebuilds the
--   total. This migration deliberately does NOT rewrite ascensionist_count:
--   Kilter/Tension totals already satisfy GREATEST(k,a)+boardsesh == upstream+boardsesh.
--
-- Safety: runs in the migrator's single transaction. RENAME and DROP COLUMN are
--   metadata-only; the fold UPDATE is the only row work and is idempotent (it only
--   raises a row whose kilter snapshot strictly exceeds its upstream, so a re-run is
--   a no-op). The covering indexes (0068/0121/0122) key/INCLUDE only the plain
--   ascensionist_count, so rename/drop touch no index.

ALTER TABLE "board_climb_stats" RENAME COLUMN "aurora_ascensionist_count" TO "upstream_ascensionist_count";--> statement-breakpoint

-- Fold the Kilter Grips snapshot into upstream. kilter_ascensionist_count is NULL
-- on every non-Kilter board, so this is naturally scoped to Kilter rows.
DO $$
DECLARE folded integer;
BEGIN
  UPDATE board_climb_stats
     SET upstream_ascensionist_count =
         GREATEST(COALESCE(upstream_ascensionist_count, 0), kilter_ascensionist_count)
   WHERE kilter_ascensionist_count IS NOT NULL
     AND kilter_ascensionist_count > COALESCE(upstream_ascensionist_count, 0);
  GET DIAGNOSTICS folded = ROW_COUNT;
  RAISE NOTICE '0141 upstream fold: raised % Kilter row(s) from their kilter snapshot', folded;
END $$;--> statement-breakpoint

ALTER TABLE "board_climb_stats" DROP COLUMN "kilter_ascensionist_count";
