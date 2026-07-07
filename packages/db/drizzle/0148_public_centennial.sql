CREATE TABLE "board_climb_grades" (
	"board_type" text NOT NULL,
	"climb_uuid" text NOT NULL,
	"angle" integer NOT NULL,
	"local_grade" double precision,
	"universal_grade" double precision,
	"grade_low" double precision,
	"grade_high" double precision,
	"confidence" text NOT NULL,
	"ascensionist_count" bigint DEFAULT 0 NOT NULL,
	"content_prior" double precision,
	"model_version" text NOT NULL,
	"coeff_version" text NOT NULL,
	"computed_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "board_climb_grades_board_type_climb_uuid_angle_pk" PRIMARY KEY("board_type","climb_uuid","angle")
);
--> statement-breakpoint
CREATE TABLE "board_grade_coefficients" (
	"coeff_version" text NOT NULL,
	"kind" text NOT NULL,
	"key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "board_grade_coefficients_coeff_version_kind_key_pk" PRIMARY KEY("coeff_version","kind","key")
);
--> statement-breakpoint
CREATE INDEX "board_climb_grades_confidence_idx" ON "board_climb_grades" USING btree ("board_type","confidence");