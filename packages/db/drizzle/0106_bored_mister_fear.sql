CREATE TABLE IF NOT EXISTS "board_climb_aliases" (
	"board_type" text NOT NULL,
	"alias_uuid" text NOT NULL,
	"canonical_uuid" text NOT NULL,
	"source" text NOT NULL,
	"first_seen_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "board_climb_aliases_board_type_alias_uuid_pk" PRIMARY KEY("board_type","alias_uuid"),
	CONSTRAINT "board_climb_aliases_uuids_non_empty" CHECK ("board_climb_aliases"."alias_uuid" <> '' AND "board_climb_aliases"."canonical_uuid" <> '')
);
--> statement-breakpoint
ALTER TABLE "board_climb_stats" ADD COLUMN IF NOT EXISTS "kilter_ascensionist_count" bigint;--> statement-breakpoint
ALTER TABLE "board_climbs" ADD COLUMN IF NOT EXISTS "hold_fingerprint" text;--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'board_climb_aliases_canonical_fk'
	) THEN
		ALTER TABLE "board_climb_aliases" ADD CONSTRAINT "board_climb_aliases_canonical_fk" FOREIGN KEY ("canonical_uuid") REFERENCES "public"."board_climbs"("uuid") ON DELETE cascade ON UPDATE cascade;
	END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "board_climb_aliases_canonical_idx" ON "board_climb_aliases" USING btree ("board_type","canonical_uuid");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "board_climbs_hold_fingerprint_idx" ON "board_climbs" USING btree ("board_type","layout_id","hold_fingerprint");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mobile_refresh_tokens_expires_at_idx" ON "mobile_refresh_tokens" USING btree ("expires_at");
