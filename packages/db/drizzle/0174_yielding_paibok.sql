CREATE TABLE "board_hold_features" (
	"board_type" text NOT NULL,
	"placement_id" integer NOT NULL,
	"layout_id" integer,
	"hole_id" integer,
	"set_id" integer,
	"x" integer,
	"y" integer,
	"norm_x" double precision,
	"norm_y" double precision,
	"edge_dist" double precision,
	"neighbor_dist" double precision,
	"is_kickboard" boolean DEFAULT false NOT NULL,
	"hand_difficulty" double precision,
	"foot_difficulty" double precision,
	"hand_sample_count" integer DEFAULT 0 NOT NULL,
	"foot_sample_count" integer DEFAULT 0 NOT NULL,
	"pull_direction" integer,
	"coarse_type" text,
	"feature_version" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "board_hold_features_board_type_placement_id_pk" PRIMARY KEY("board_type","placement_id")
);
--> statement-breakpoint
CREATE INDEX "board_hold_features_board_layout_idx" ON "board_hold_features" USING btree ("board_type","layout_id");