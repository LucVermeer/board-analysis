ALTER TABLE "aurora_credentials" ADD COLUMN "consecutive_failures" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "aurora_credentials" ADD COLUMN "last_sync_error" text;--> statement-breakpoint
CREATE INDEX "boardsesh_ticks_flash_send_updated_at_idx" ON "boardsesh_ticks" USING btree ("updated_at") WHERE "boardsesh_ticks"."status" IN ('flash','send');