-- Custom SQL migration file, put your code below! --
--
-- Sentinel cleanup for board_climb_stats: replace "no data" placeholder 0/1
-- values (stored as if they were real ratings/grades) with NULL, so they sort
-- and render as "unrated / ungraded" instead of 0-star / grade-1.
--
-- Three independent, idempotent statements (each guarded by the placeholder
-- value, so re-running is a no-op). Prod counts verified read-only 2026-07-07.
--
-- 1. quality_average = 0 → NULL, all boards. 0 is the Aurora "unrated" sentinel
--    but renders as 0 stars and drags averages down. Prod: 22,498 rows
--    (moonboard 19,883, kilter 1,692, tension 886, decoy 24, grasshopper 13).
--
-- 2. Kilter difficulty placeholders: difficulty_average IN (0,1) → NULL. Grade
--    id 1 doesn't exist and 0 is Number(null); valid Kilter grade ids are ~10-33.
--    display_difficulty / benchmark_difficulty are nulled too when they carry the
--    same 0/1 placeholder (a real benchmark grade on such a row is preserved).
--    Prod: 6,622 rows (4,932 at difficulty_average=1, 1,690 at 0; some carry
--    13k+ ascents, so these are visible classics with a broken grade).
--
-- 3. Aurora-board difficulty_average = 0 → NULL (from Number(null) in the sync,
--    now fixed at the source in shared-sync.ts). display_difficulty /
--    benchmark_difficulty nulled where they are the same 0 placeholder. Prod:
--    1,167 rows (tension 1,120, decoy 27, grasshopper 18, soill 2).

-- 1. Unrated quality sentinel → NULL (all boards).
UPDATE board_climb_stats
   SET quality_average = NULL
 WHERE quality_average = 0;
--> statement-breakpoint

-- 2. Kilter difficulty placeholders (0 or 1) → NULL, plus co-placeholder
--    display/benchmark grades.
UPDATE board_climb_stats
   SET difficulty_average   = NULL,
       display_difficulty   = CASE WHEN display_difficulty IN (0, 1) THEN NULL ELSE display_difficulty END,
       benchmark_difficulty = CASE WHEN benchmark_difficulty IN (0, 1) THEN NULL ELSE benchmark_difficulty END
 WHERE board_type = 'kilter'
   AND difficulty_average IN (0, 1);
--> statement-breakpoint

-- 3. Aurora-board difficulty = 0 sentinel → NULL, plus co-placeholder grades.
UPDATE board_climb_stats
   SET difficulty_average   = NULL,
       display_difficulty   = CASE WHEN display_difficulty = 0 THEN NULL ELSE display_difficulty END,
       benchmark_difficulty = CASE WHEN benchmark_difficulty = 0 THEN NULL ELSE benchmark_difficulty END
 WHERE board_type IN ('tension', 'decoy', 'soill', 'touchstone', 'grasshopper')
   AND difficulty_average = 0;
