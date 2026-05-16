ALTER TABLE "activity_push_tokens" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "activity_push_tokens" ADD CONSTRAINT "activity_push_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_push_tokens_user_idx" ON "activity_push_tokens" USING btree ("user_id");