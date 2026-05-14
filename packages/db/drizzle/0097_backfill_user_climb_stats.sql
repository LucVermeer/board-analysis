-- Migration: Backfill stats + denormalized columns for Boardsesh-originated climbs.
--
-- Context:
--   Two compounding bugs hid every user-created Boardsesh climb from the
--   global climbs search:
--
--   1. The search hot path INNER JOINs board_climb_stats. Stats rows came
--      exclusively from the Aurora sync pipeline, so saveClimb / grade-less
--      saveMoonBoardClimb saves left climbs with no stats row at all.
--
--   2. populateDenormalizedColumns extracts hold IDs from the `frames` text
--      using the POSIX regex `p(\d+)r`. The TypeScript source wrote the
--      literal `'p(\d+)r'`, but a JS string literal silently drops the
--      backslash before `\d` (unrecognized escape), so PostgreSQL received
--      `'p(d+)r'` — which matches `pd+r` literally and finds no hold IDs.
--      Result: every user-created Kilter/Tension climb had NULL edge_left,
--      required_set_ids, and compatible_size_ids. The search filter requires
--      compatible_size_ids to contain the user's selected size, so the climb
--      was filtered out at the SQL level even when the name matched.
--
--   Application code now (a) seeds a stats row at climb-create time, and
--   (b) uses the correctly-escaped regex in populateDenormalizedColumns.
--   This migration patches the historical data.
--
-- Safety / idempotency:
--   - Drafts are deliberately skipped — search uses LEFT JOIN for drafts
--     and the denormalized columns are only consulted on the listed path.
--   - Step 1 (stats backfill): ON CONFLICT DO NOTHING, idempotent.
--   - Steps 2-4 (denormalization): WHERE clauses guard each update so a
--     re-run only touches rows that still need work.

-- Step 1: insert missing stats rows so listed user climbs are JOIN-visible.
INSERT INTO board_climb_stats (
  board_type,
  climb_uuid,
  angle,
  ascensionist_count,
  display_difficulty,
  benchmark_difficulty,
  difficulty_average,
  quality_average,
  fa_username,
  fa_at
)
SELECT
  bc.board_type,
  bc.uuid,
  bc.angle,
  0,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM board_climbs bc
LEFT JOIN board_climb_stats bcs
  ON bcs.board_type = bc.board_type
 AND bcs.climb_uuid = bc.uuid
 AND bcs.angle      = bc.angle
WHERE bc.is_listed    = TRUE
  AND bc.is_draft     = FALSE
  AND bc.user_id      IS NOT NULL
  AND bc.angle        IS NOT NULL
  AND bcs.climb_uuid  IS NULL
ON CONFLICT (board_type, climb_uuid, angle) DO NOTHING;

-- Step 2: derive edge_left/right/bottom/top from hold positions for any
-- Kilter/Tension user climb that's missing them. Mirrors the SQL in
-- packages/db/src/queries/climbs/populate-denormalized-columns.ts.
UPDATE board_climbs c
SET edge_left   = sub.min_x,
    edge_right  = sub.max_x,
    edge_bottom = sub.min_y,
    edge_top    = sub.max_y
FROM (
  SELECT c2.uuid, c2.board_type,
    MIN(bh.x) AS min_x, MAX(bh.x) AS max_x,
    MIN(bh.y) AS min_y, MAX(bh.y) AS max_y
  FROM board_climbs c2
  CROSS JOIN LATERAL regexp_matches(c2.frames, 'p(\d+)r', 'g') AS m(hold_id_arr)
  JOIN board_placements bp
    ON bp.id        = (m.hold_id_arr[1])::int
   AND bp.board_type = c2.board_type
   AND bp.layout_id  = c2.layout_id
  JOIN board_holes bh
    ON bh.id        = bp.hole_id
   AND bh.board_type = c2.board_type
  WHERE c2.board_type IN ('kilter', 'tension')
    AND c2.user_id    IS NOT NULL
    AND c2.edge_left  IS NULL
    AND c2.frames     IS NOT NULL
  GROUP BY c2.uuid, c2.board_type
) sub
WHERE c.uuid = sub.uuid AND c.board_type = sub.board_type;

-- Step 3: populate required_set_ids from the same hold-ID extraction.
UPDATE board_climbs c
SET required_set_ids = sub.sets
FROM (
  SELECT c2.uuid, c2.board_type,
    ARRAY_AGG(DISTINCT bp.set_id ORDER BY bp.set_id) AS sets
  FROM board_climbs c2
  CROSS JOIN LATERAL regexp_matches(c2.frames, 'p(\d+)r', 'g') AS m(hold_id_arr)
  JOIN board_placements bp
    ON bp.id        = (m.hold_id_arr[1])::int
   AND bp.board_type = c2.board_type
   AND bp.layout_id  = c2.layout_id
  WHERE c2.board_type        IN ('kilter', 'tension')
    AND c2.user_id           IS NOT NULL
    AND c2.required_set_ids  IS NULL
    AND c2.frames            IS NOT NULL
  GROUP BY c2.uuid, c2.board_type
) sub
WHERE c.uuid = sub.uuid AND c.board_type = sub.board_type;

-- Step 4: populate compatible_size_ids by comparing each climb's bounding box
-- against the available board product sizes.
UPDATE board_climbs c
SET compatible_size_ids = sub.size_ids
FROM (
  SELECT c2.uuid, c2.board_type,
    ARRAY_AGG(ps.id ORDER BY ps.id) AS size_ids
  FROM board_climbs c2
  JOIN board_product_sizes ps
    ON ps.board_type   = c2.board_type
   AND c2.edge_left    > ps.edge_left
   AND c2.edge_right   < ps.edge_right
   AND c2.edge_bottom  > ps.edge_bottom
   AND c2.edge_top     < ps.edge_top
  WHERE c2.board_type            IN ('kilter', 'tension')
    AND c2.user_id               IS NOT NULL
    AND c2.compatible_size_ids   IS NULL
    AND c2.edge_left             IS NOT NULL
  GROUP BY c2.uuid, c2.board_type
) sub
WHERE c.uuid = sub.uuid AND c.board_type = sub.board_type;
