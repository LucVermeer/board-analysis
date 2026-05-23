CREATE TYPE "public"."kilter_table_type" AS ENUM('logs', 'attempts');--> statement-breakpoint
ALTER TABLE "aurora_credentials" ALTER COLUMN "encrypted_username" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "aurora_credentials" ALTER COLUMN "encrypted_password" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "user_board_mappings" ALTER COLUMN "board_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "aurora_credentials" ADD COLUMN "encrypted_refresh_token" text;--> statement-breakpoint
ALTER TABLE "user_board_mappings" ADD COLUMN "board_user_id_text" text;--> statement-breakpoint
ALTER TABLE "boardsesh_ticks" ADD COLUMN "kilter_type" "kilter_table_type";--> statement-breakpoint
ALTER TABLE "boardsesh_ticks" ADD COLUMN "kilter_id" text;--> statement-breakpoint
ALTER TABLE "boardsesh_ticks" ADD COLUMN "kilter_synced_at" timestamp;--> statement-breakpoint
ALTER TABLE "boardsesh_ticks" ADD COLUMN "kilter_sync_error" text;--> statement-breakpoint
ALTER TABLE "playlists" ADD COLUMN "kilter_type" text;--> statement-breakpoint
ALTER TABLE "playlists" ADD COLUMN "kilter_id" text;--> statement-breakpoint
ALTER TABLE "playlists" ADD COLUMN "kilter_synced_at" timestamp;--> statement-breakpoint
CREATE INDEX "board_user_mapping_text_idx" ON "user_board_mappings" USING btree ("board_type","board_user_id_text");--> statement-breakpoint
CREATE UNIQUE INDEX "boardsesh_ticks_kilter_id_unique" ON "boardsesh_ticks" USING btree ("kilter_id");--> statement-breakpoint
CREATE INDEX "boardsesh_ticks_kilter_sync_pending_idx" ON "boardsesh_ticks" USING btree ("kilter_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "playlists_kilter_id_idx" ON "playlists" USING btree ("kilter_id");