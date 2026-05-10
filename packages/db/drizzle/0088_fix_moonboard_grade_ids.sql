-- Existing MoonBoard ticks already store shared BOULDER_GRADES difficulty IDs.
-- The shifted IDs lived in the MoonBoard lookup labels, so remapping
-- boardsesh_ticks.difficulty here would corrupt user-selected grades.
INSERT INTO board_difficulty_grades (board_type, difficulty, boulder_name, route_name, is_listed)
VALUES
  ('moonboard', 13, '5a/V1', NULL, true),
  ('moonboard', 14, '5b/V1', NULL, true),
  ('moonboard', 15, '5c/V2', NULL, true),
  ('moonboard', 16, '6a/V3', NULL, true),
  ('moonboard', 17, '6a+/V3', NULL, true),
  ('moonboard', 18, '6b/V4', NULL, true),
  ('moonboard', 19, '6b+/V4', NULL, true),
  ('moonboard', 20, '6c/V5', NULL, true),
  ('moonboard', 21, '6c+/V5', NULL, true),
  ('moonboard', 22, '7a/V6', NULL, true),
  ('moonboard', 23, '7a+/V7', NULL, true),
  ('moonboard', 24, '7b/V8', NULL, true),
  ('moonboard', 25, '7b+/V8', NULL, true),
  ('moonboard', 26, '7c/V9', NULL, true),
  ('moonboard', 27, '7c+/V10', NULL, true),
  ('moonboard', 28, '8a/V11', NULL, true),
  ('moonboard', 29, '8a+/V12', NULL, true),
  ('moonboard', 30, '8b/V13', NULL, true),
  ('moonboard', 31, '8b+/V14', NULL, true)
ON CONFLICT (board_type, difficulty)
DO UPDATE SET
  boulder_name = EXCLUDED.boulder_name,
  route_name = EXCLUDED.route_name,
  is_listed = EXCLUDED.is_listed;--> statement-breakpoint

UPDATE board_difficulty_grades
SET is_listed = false
WHERE board_type = 'moonboard'
  AND difficulty < 13;
