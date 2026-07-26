CREATE TYPE "public"."logbook_sync_skip_reason" AS ENUM('invalid_angle', 'invalid_identity', 'normalize_failed', 'db_write_rejected');--> statement-breakpoint
CREATE TABLE "board_climb_ingest_skips" (
	"board_type" text NOT NULL,
	"climb_uuid" text NOT NULL,
	"layout_id" integer,
	"source_layout_uuid" text,
	"reason" text NOT NULL,
	"detail" text,
	"raw_holds" text NOT NULL,
	"frames_count" integer,
	"climb_name" text,
	"setter_username" text,
	"first_seen_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp,
	CONSTRAINT "board_climb_ingest_skips_board_type_climb_uuid_pk" PRIMARY KEY("board_type","climb_uuid")
);
--> statement-breakpoint
CREATE TABLE "sync_daemon_leases" (
	"daemon_name" text PRIMARY KEY NOT NULL,
	"holder_id" text NOT NULL,
	"acquired_at" timestamp DEFAULT now() NOT NULL,
	"heartbeat_at" timestamp DEFAULT now() NOT NULL,
	"hostname" text
);
--> statement-breakpoint
CREATE TABLE "logbook_sync_skips" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"board_type" text NOT NULL,
	"aurora_type" "aurora_table_type" NOT NULL,
	"aurora_id" text NOT NULL,
	"reason" "logbook_sync_skip_reason" NOT NULL,
	"detail" text,
	"payload" jsonb,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"seen_count" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "logbook_sync_skips" ADD CONSTRAINT "logbook_sync_skips_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "board_climb_ingest_skips_open_idx" ON "board_climb_ingest_skips" USING btree ("board_type","reason","resolved_at");--> statement-breakpoint
CREATE UNIQUE INDEX "logbook_sync_skips_row_unique" ON "logbook_sync_skips" USING btree ("user_id","board_type","aurora_type","aurora_id");--> statement-breakpoint
CREATE INDEX "logbook_sync_skips_user_board_idx" ON "logbook_sync_skips" USING btree ("user_id","board_type");--> statement-breakpoint
CREATE INDEX "logbook_sync_skips_reason_seen_idx" ON "logbook_sync_skips" USING btree ("reason","last_seen_at");--> statement-breakpoint
CREATE INDEX "board_circuits_user_idx" ON "board_circuits" USING btree ("board_type","user_id");