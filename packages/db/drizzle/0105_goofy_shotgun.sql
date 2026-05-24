CREATE UNIQUE INDEX IF NOT EXISTS "mobile_refresh_tokens_token_hash_idx" ON "mobile_refresh_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mobile_refresh_tokens_user_id_idx" ON "mobile_refresh_tokens" USING btree ("user_id");
