ALTER TABLE "boardsesh_ticks" ADD CONSTRAINT "boardsesh_ticks_quality_range" CHECK ("boardsesh_ticks"."quality" IS NULL OR ("boardsesh_ticks"."quality" >= 1 AND "boardsesh_ticks"."quality" <= 5));
