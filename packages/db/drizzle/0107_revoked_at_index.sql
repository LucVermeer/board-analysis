CREATE INDEX CONCURRENTLY IF NOT EXISTS "mobile_refresh_tokens_revoked_at_partial_idx"
  ON "mobile_refresh_tokens" ("revoked_at")
  WHERE "revoked_at" IS NOT NULL;
