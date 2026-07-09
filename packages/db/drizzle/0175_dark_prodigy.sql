CREATE TABLE "board_climb_embeddings" (
	"board_type" text NOT NULL,
	"climb_uuid" text NOT NULL,
	"angle" integer NOT NULL,
	"content_prior" double precision,
	"content_sd" double precision,
	"embedding" real[],
	"model_version" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"sync_seq" bigserial NOT NULL,
	CONSTRAINT "board_climb_embeddings_board_type_climb_uuid_angle_pk" PRIMARY KEY("board_type","climb_uuid","angle")
);
--> statement-breakpoint
CREATE INDEX "board_climb_embeddings_board_idx" ON "board_climb_embeddings" USING btree ("board_type");