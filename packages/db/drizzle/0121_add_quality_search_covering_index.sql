-- Cover broad quality-sorted climb searches without a parallel sort.
-- Matches searchClimbs' stats-driven `quality DESC NULLS LAST` path.
CREATE INDEX IF NOT EXISTS board_climb_stats_quality_covering_idx
  ON board_climb_stats (board_type, angle, quality_average DESC NULLS LAST)
  INCLUDE (climb_uuid, ascensionist_count, display_difficulty, difficulty_average, benchmark_difficulty);
