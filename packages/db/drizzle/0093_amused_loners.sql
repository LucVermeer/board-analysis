ALTER TABLE "board_beta_links" ADD COLUMN "created_by_user_id" text;--> statement-breakpoint
CREATE INDEX "board_beta_links_created_by_idx" ON "board_beta_links" USING btree ("created_by_user_id","created_at") WHERE "board_beta_links"."created_by_user_id" IS NOT NULL;--> statement-breakpoint
-- FK is added manually because the Drizzle schema doesn't declare a
-- references() on this column (the boards/ schema avoids cross-package
-- references to auth/users). ON DELETE SET NULL preserves the community
-- video record when an account is deleted — attribution drops out but
-- the link, thumbnail, and IG handle survive.
ALTER TABLE "board_beta_links" ADD CONSTRAINT "board_beta_links_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL;