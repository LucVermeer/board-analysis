-- Migration: Backfill board_sessions.ended_at from tick evidence.
--
-- Context:
--   The auto-finish sweep (PR #1955) and the manual endSession() path both
--   wrote ended_at = NOW() at the moment they ran. For auto-finished rows
--   that's up to ~1 hour after the user actually stopped, so the
--   session-summary duration (ended_at - started_at) is inflated. The
--   forward fix uses last_activity as the new stop time, but past rows had
--   last_activity clobbered to the same NOW() value, so we recover from
--   MAX(boardsesh_ticks.climbed_at) instead.
--
-- What this does:
--   For each status='ended' session with non-null ended_at, compute the
--   greatest of (last climb time, started_at) and overwrite ended_at with
--   that value when it's earlier than the currently-stored ended_at.
--
-- Safety / idempotency:
--   - Skips rows where there is no evidence (no ticks AND null started_at).
--   - Only writes when evidence_at < current ended_at, so re-running the
--     migration is a no-op.
--   - Clamps to started_at so ended_at can never be set before the session
--     began.
--   - Touches ended_at only; last_activity stays as-is.

DO $$
DECLARE
  updated_count integer;
BEGIN
  UPDATE board_sessions b
  SET ended_at = sub.evidence_at
  FROM (
    SELECT b2.id,
           GREATEST(MAX(t.climbed_at)::timestamp, b2.started_at) AS evidence_at
    FROM board_sessions b2
    LEFT JOIN boardsesh_ticks t ON t.session_id = b2.id
    WHERE b2.status = 'ended'
      AND b2.ended_at IS NOT NULL
    GROUP BY b2.id, b2.started_at
  ) sub
  WHERE b.id = sub.id
    AND sub.evidence_at IS NOT NULL
    AND sub.evidence_at < b.ended_at;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE 'Backfilled ended_at for % board_sessions rows', updated_count;
END $$;
