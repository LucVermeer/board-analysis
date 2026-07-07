-- Custom SQL migration file, put your code below! --
--
-- Best-effort: rescale board_climb_stats_history.quality_average onto the
-- canonical 1-5 scale so the "quality over time" charts stop showing fake
-- cliffs where the stored scale changed mid-history. History is chart-only (no
-- user-facing rating reads it), so precision here is secondary to the current
-- board_climb_stats fixes in 0149/0150.
--
-- IMPORTANT prod finding (read-only, 2026-07-07) — the scale here is NOT what a
-- naive "aurora history is ×5/3" model assumes:
--   * Aurora history is ~97% RAW 1-3 (written by the initial board import, which
--     stored quality_average verbatim) with only a ~3% ×5/3 tail (the 2026
--     Aurora-sync writes, after normalizeQualityTo5 was added). Example: tension
--     history has 1,760,346 rows <= 3 and only 50,954 rows > 3; 2024/2025 rows
--     top out at exactly 3.0.
--   * Kilter history is 100% RAW 1-3 (max value 3.0), all from the import.
-- Applying a single ×5/3-reversal (1.2q − 1) uniformly would CORRUPT the raw-1-3
-- majority (a raw 3.0 → 2.6). So we use an adaptive, per-row rule instead.
--
-- Rule
--   * Kilter, pre-cutover (fa_at < 2025-09-01): raw 1-3 → clamp(2q − 1, 1, 5).
--     Post-cutover / unknown-era kilter history is left as-is (small residue,
--     accepted). Mirrors correctGripsQualityAverage.
--   * Aurora boards (tension/decoy/soill/touchstone/grasshopper):
--       - quality > 3  → the ×5/3 tail        → clamp(1.2q − 1, 1, 5).
--       - quality 0..3 → the raw-1-3 majority  → clamp(2q − 1, 1, 5).
--     Residual error: the minority of ×5/3 rows that fell <= 3 (a low-rated 2026
--     sync row) is treated as raw and converted slightly high. This is bounded
--     (per board, the ambiguous <= 3 population is small where ×5/3 dominates,
--     e.g. soill) and acceptable for a chart-only surface.
--   * MoonBoard and everything else: untouched.
--   * quality <= 0 / NULL: skipped.
--
-- Operational note: this rewrites ~5.4M rows (kilter ~3.6M pre-cutover + aurora
-- ~1.8M) and runs inside the migration transaction. It is chunked by the
-- bigserial id (single pass, safe within the run) to keep each statement bounded,
-- but it is still a large one-time backfill — expect meaningful WAL and runtime.
-- Prefer a low-traffic window. This migration is NOT value-idempotent: a second
-- application would rescale already-rescaled values. Safety comes from the
-- migrator, not this file — drizzle's postgres-js migrator wraps all pending
-- migrations and their __drizzle_migrations records in ONE transaction, so a
-- failed/interrupted run rolls back completely and a retry starts from the
-- original data. The id cursor is single-pass only WITHIN a run.
--
-- ⚠️ NEVER run this file manually via psql (e.g. during incident response):
-- outside the migrator's transaction + __drizzle_migrations bookkeeping there
-- is nothing to stop a second application from double-converting 5.4M rows.

DO $$
DECLARE
  v_batch bigint := 50000;
  v_lo    bigint := 0;
  v_max   bigint;
  v_delta bigint;
  v_total bigint := 0;
BEGIN
  SELECT COALESCE(max(id), 0) INTO v_max FROM board_climb_stats_history;

  WHILE v_lo <= v_max LOOP
    WITH upd AS (
      UPDATE board_climb_stats_history t
      SET quality_average = CASE
        -- 0 is the legacy "unrated" sentinel, not a rating — NULL it here the
        -- same way 0151 does for live stats, so charts stop plotting 0-star
        -- points. (Also why the transforms below never see a 0.)
        WHEN t.quality_average = 0 THEN NULL
        -- Kilter (WHERE already restricts to pre-cutover): raw 1-3 → 1-5.
        WHEN t.board_type = 'kilter'
          THEN LEAST(5.0, GREATEST(1.0, 2.0 * t.quality_average - 1.0))
        -- Aurora ×5/3 tail.
        WHEN t.quality_average > 3.0
          THEN LEAST(5.0, GREATEST(1.0, 1.2 * t.quality_average - 1.0))
        -- Aurora raw-1-3 majority.
        ELSE LEAST(5.0, GREATEST(1.0, 2.0 * t.quality_average - 1.0))
      END
      WHERE t.id >= v_lo
        AND t.id < v_lo + v_batch
        AND t.quality_average IS NOT NULL
        AND (
          -- zero-sentinels are nulled on EVERY board (they're never a rating)…
          t.quality_average = 0
          -- …while the rescale itself keeps its era/board scope.
          OR (
            t.quality_average > 0
            AND (
              (t.board_type = 'kilter' AND t.fa_at IS NOT NULL AND t.fa_at < TIMESTAMP '2025-09-01')
              OR t.board_type IN ('tension', 'decoy', 'soill', 'touchstone', 'grasshopper')
            )
          )
        )
      RETURNING 1
    )
    SELECT count(*) INTO v_delta FROM upd;

    v_total := v_total + v_delta;
    v_lo := v_lo + v_batch;
  END LOOP;

  RAISE NOTICE 'history quality rescale (best-effort): rewrote % row(s) onto 1-5', v_total;
END $$;
