CREATE TABLE "board_climb_similar" (
	"board_type" text NOT NULL,
	"climb_uuid" text NOT NULL,
	"angle" integer NOT NULL,
	"neighbor_uuid" text NOT NULL,
	"score" real NOT NULL,
	"rank" integer NOT NULL,
	"model_version" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "board_climb_similar_board_type_climb_uuid_angle_neighbor_uuid_pk" PRIMARY KEY("board_type","climb_uuid","angle","neighbor_uuid")
);
--> statement-breakpoint
CREATE INDEX "board_climb_similar_lookup_idx" ON "board_climb_similar" USING btree ("board_type","climb_uuid","angle","rank");