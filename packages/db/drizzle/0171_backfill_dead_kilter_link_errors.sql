-- Custom SQL migration file, put your code below! --
--
-- One-time reconciliation: the dead password-era Kilter links.
--
-- Background
--   9 Kilter credentials (prod, 2026-07) carry encrypted_refresh_token IS NULL.
--   They predate the OAuth/Keycloak flow — they were created by the old
--   username/password Aurora path and have no refresh token, so kilter-sync's
--   getNextCredentialToSync (which requires encrypted_refresh_token IS NOT NULL)
--   has silently excluded every one of them since March. Worse, the row they
--   were frozen on carries a stale, misleading error from that last
--   password-era attempt:
--     "Login failed: Error: Network error: Unable to connect to http…"
--   so anyone reading the credential sees a transient-looking network blip, not
--   "this connection can't sync until you reconnect".
--
-- Fix
--   Stamp an accurate, terminal state so the credential tells the truth:
--     sync_status = 'expired'  (the runner's "user must re-auth" terminal state,
--                               excluded from selection — belt-and-suspenders
--                               with the encrypted_refresh_token IS NOT NULL
--                               filter, and the status the UI reads to decide
--                               whether to prompt a reconnect).
--     sync_error  = the plain re-link message.
--   consecutive_failures is reset to 0 — these aren't "failing"; they're parked
--   pending a user reconnect, and we don't want them counted toward backoff.
--   last_sync_error is cleared to NULL — it's the observability counterpart of
--   consecutive_failures (the most recent failure's message, cleared on the next
--   success). Leaving the stale password-era "Network error…" there would
--   contradict a consecutive_failures = 0 row that is parked, not failing.
--
-- Surfacing a re-link PROMPT in the UI is intentionally OUT of scope for this
-- migration (tracked as a product follow-up) — this only makes the stored state
-- accurate so the runner skips them explicitly instead of on a lie.
--
-- Idempotent: the WHERE excludes rows already reconciled (sync_error already
-- set to the re-link copy), so re-running is a no-op. Scoped to Kilter rows
-- with no refresh token only; never touches a syncable credential.

UPDATE aurora_credentials
   SET sync_status = 'expired',
       sync_error = 're-link required: this connection predates OAuth and can no longer sync',
       consecutive_failures = 0,
       last_sync_error = NULL,
       updated_at = now()
 WHERE board_type = 'kilter'
   AND encrypted_refresh_token IS NULL
   AND sync_error IS DISTINCT FROM 're-link required: this connection predates OAuth and can no longer sync';
