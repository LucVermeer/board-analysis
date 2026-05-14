-- Idempotent: the previous (now-reverted) merge of this PR baked the
-- column into the pre-built dev DB image, so the migration tag isn't
-- yet in drizzle.__drizzle_migrations but the column already exists.
-- Without `IF NOT EXISTS` the drizzle migrator throws "column already
-- exists" and the E2E pipeline can't apply migrations on those images.
ALTER TABLE "board_beta_links" ADD COLUMN IF NOT EXISTS "created_by_user_id" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "board_beta_links_created_by_idx" ON "board_beta_links" USING btree ("created_by_user_id","created_at") WHERE "board_beta_links"."created_by_user_id" IS NOT NULL;--> statement-breakpoint
-- FK is added manually because the Drizzle schema doesn't declare a
-- references() on this column (the boards/ schema avoids cross-package
-- references to auth/users). ON DELETE SET NULL preserves the community
-- video record when an account is deleted — attribution drops out but
-- the link, thumbnail, and IG handle survive.
--
-- Postgres has no `ADD CONSTRAINT IF NOT EXISTS`; use a DO block guarded
-- by pg_constraint lookup so the statement is safe to re-run.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'board_beta_links_created_by_user_id_fkey'
      AND conrelid = '"board_beta_links"'::regclass
  ) THEN
    ALTER TABLE "board_beta_links"
      ADD CONSTRAINT "board_beta_links_created_by_user_id_fkey"
      FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL;
  END IF;
END $$;
