-- Quality blend column-split (mirrors the ascensionist_count split in 0141/0155):
--   upstream_quality_average  — the single upstream (manufacturer) quality avg
--   boardsesh_quality_sum     — SUM of Boardsesh native rating votes (blend numerator)
--   boardsesh_quality_count   — COUNT of Boardsesh rating voters (blend weight)
-- board_climb_stats.quality_average becomes the materialized BLEND of these
-- (blendedQualityAverageSql, packages/db/src/queries/climb-stats/quality-blend.ts).
-- All nullable, no default → metadata-only ADD COLUMN, no table rewrite.
-- Initialized by 0168 (upstream_quality_average) + 0169 (boardsesh terms + blend).
--
-- Generate-footgun review (both known footguns from the 0155 header CHECKED):
--   (a) drizzle-kit 0.31 does not parse the object-form check() on boardsesh_ticks
--       and re-serializing that table would DROP boardsesh_ticks_quality_range.
--       It did NOT fire here: this diff only touches board_climb_stats, so
--       boardsesh_ticks was copied verbatim from the 0166 snapshot (checkConstraints
--       intact — verified in 0167_snapshot.json). Nothing stripped.
--   (b) No destructive statements against the manually-managed covering indexes
--       (0068/0121/0122) or FKs — those stay out of the drizzle snapshot, so the
--       generated diff never references them. Verified: 0167 SQL is 3 ADD COLUMNs only.
ALTER TABLE "board_climb_stats" ADD COLUMN "upstream_quality_average" double precision;--> statement-breakpoint
ALTER TABLE "board_climb_stats" ADD COLUMN "boardsesh_quality_sum" double precision;--> statement-breakpoint
ALTER TABLE "board_climb_stats" ADD COLUMN "boardsesh_quality_count" bigint;
