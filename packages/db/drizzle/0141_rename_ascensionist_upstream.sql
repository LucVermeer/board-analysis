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
-- Note: rows whose source column was NULL after the rename (MoonBoard, and any
--   direct-Aurora rows bulk-seeded without an aurora count) had their external
--   count written straight into ascensionist_count by the old importer. Step (3)
--   recovers it into upstream so a later tick recompute (upstream + boardsesh)
--   ADDS to it instead of wiping it — this closes the wipe permanently for climbs
--   the post-deploy re-import can't reach (e.g. MoonBoard problems delisted from
--   the app catalog). Already-wiped rows (ascensionist == boardsesh) recover to 0
--   and are raised by the re-import. ascensionist_count itself is left unchanged:
--   Kilter/Tension totals already satisfy upstream + boardsesh after the fold.
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

-- Recover directly-written external counts into upstream. Any row still lacking
-- an upstream value (NULL) had its manufacturer count written straight into
-- ascensionist_count with no source column — MoonBoard, plus direct-Aurora rows
-- bulk-seeded without an aurora count. Move it into upstream so the tick recompute
-- adds to it. Folded Kilter/Tension rows have a non-NULL upstream and are skipped;
-- Boardsesh-native climbs (ascensionist == boardsesh) recover to 0, which is a
-- no-op. Idempotent: re-running finds no NULL-upstream rows left.
DO $$
DECLARE recovered integer;
BEGIN
  UPDATE board_climb_stats
     SET upstream_ascensionist_count =
         GREATEST(ascensionist_count - COALESCE(boardsesh_ascensionist_count, 0), 0)
   WHERE upstream_ascensionist_count IS NULL
     AND ascensionist_count IS NOT NULL;
  GET DIAGNOSTICS recovered = ROW_COUNT;
  RAISE NOTICE '0141 upstream recover: seeded upstream for % source-less row(s)', recovered;
END $$;--> statement-breakpoint

ALTER TABLE "board_climb_stats" DROP COLUMN "kilter_ascensionist_count";
