CREATE TABLE "gym_kiosks" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"uuid" text NOT NULL,
	"gym_id" bigint NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"layout" jsonb DEFAULT '{"version":1,"boards":[],"leaderboard":null}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "gym_kiosks_uuid_unique" UNIQUE("uuid")
);
--> statement-breakpoint
ALTER TABLE "gyms" ADD COLUMN "logo_url" text;--> statement-breakpoint
ALTER TABLE "gyms" ADD COLUMN "brand_primary_color" text;--> statement-breakpoint
ALTER TABLE "gyms" ADD COLUMN "brand_accent_color" text;--> statement-breakpoint
ALTER TABLE "gyms" ADD COLUMN "brand_background_color" text;--> statement-breakpoint
ALTER TABLE "gym_kiosks" ADD CONSTRAINT "gym_kiosks_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "gym_kiosks_unique_gym_slug" ON "gym_kiosks" USING btree ("gym_id","slug") WHERE "gym_kiosks"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "gym_kiosks_gym_idx" ON "gym_kiosks" USING btree ("gym_id") WHERE "gym_kiosks"."deleted_at" IS NULL;