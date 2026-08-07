CREATE TYPE "public"."private_attempt_video_status" AS ENUM('uploading', 'finalizing', 'ready', 'failed', 'deleting');--> statement-breakpoint
CREATE TABLE "private_attempt_videos" (
	"uuid" text NOT NULL,
	"owner_user_id" text NOT NULL,
	"tick_uuid" text,
	"board_type" text NOT NULL,
	"climb_provider" text DEFAULT 'boardsesh_public_graphql_search_climbs' NOT NULL,
	"climb_uuid" text NOT NULL,
	"layout_id" integer NOT NULL,
	"angle" integer NOT NULL,
	"is_mirror" boolean DEFAULT false NOT NULL,
	"board_id" bigint,
	"session_id" text,
	"asset_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"byte_size" bigint DEFAULT 0 NOT NULL,
	"duration_ms" integer,
	"status" "private_attempt_video_status" DEFAULT 'uploading' NOT NULL,
	"failure_code" text,
	"recorded_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"client_recording_id" text NOT NULL,
	CONSTRAINT "private_attempt_videos_uuid_pk" PRIMARY KEY("uuid"),
	CONSTRAINT "private_attempt_videos_moonboard_2024_only" CHECK ("private_attempt_videos"."board_type" = 'moonboard' AND "private_attempt_videos"."layout_id" = 3),
	CONSTRAINT "private_attempt_videos_byte_size_non_negative" CHECK ("private_attempt_videos"."byte_size" >= 0),
	CONSTRAINT "private_attempt_videos_duration_non_negative" CHECK ("private_attempt_videos"."duration_ms" IS NULL OR "private_attempt_videos"."duration_ms" >= 0)
);
--> statement-breakpoint
ALTER TABLE "private_attempt_videos" ADD CONSTRAINT "private_attempt_videos_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private_attempt_videos" ADD CONSTRAINT "private_attempt_videos_tick_uuid_boardsesh_ticks_uuid_fk" FOREIGN KEY ("tick_uuid") REFERENCES "public"."boardsesh_ticks"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private_attempt_videos" ADD CONSTRAINT "private_attempt_videos_board_id_user_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."user_boards"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private_attempt_videos" ADD CONSTRAINT "private_attempt_videos_session_id_board_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."board_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "private_attempt_videos_asset_key_unique" ON "private_attempt_videos" USING btree ("asset_key");--> statement-breakpoint
CREATE UNIQUE INDEX "private_attempt_videos_tick_uuid_unique" ON "private_attempt_videos" USING btree ("tick_uuid") WHERE "private_attempt_videos"."tick_uuid" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "private_attempt_videos_owner_client_recording_unique" ON "private_attempt_videos" USING btree ("owner_user_id","client_recording_id");--> statement-breakpoint
CREATE INDEX "private_attempt_videos_owner_climb_created_idx" ON "private_attempt_videos" USING btree ("owner_user_id","board_type","climb_uuid","created_at");--> statement-breakpoint
CREATE INDEX "private_attempt_videos_status_updated_idx" ON "private_attempt_videos" USING btree ("status","updated_at");