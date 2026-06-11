DROP INDEX "integration_credentials_user_idx";--> statement-breakpoint
ALTER TABLE "integration_exports" ALTER COLUMN "status" DROP DEFAULT;