-- Migration: split board_climb_stats.ascensionist_count into per-source columns
-- so Boardsesh ticks can contribute to ranking without fighting the Aurora sync.
--
-- Context:
--   Today every value in board_climb_stats comes from the Aurora sync pipeline
--   (packages/aurora-sync/src/sync/shared-sync.ts:upsertClimbStats), which does
--   INSERT ... ON CONFLICT DO UPDATE with no preservation logic. A naive
--   Boardsesh-side increment of ascensionist_count would be clobbered on the
--   next sync.
--
--   Resolution: split the storage. Aurora owns aurora_ascensionist_count.
--   Boardsesh ticks own boardsesh_ascensionist_count. ascensionist_count
--   stays as the materialized sum, kept in lockstep by both writers in the
--   same statements that touch their share. Search continues to read
--   ascensionist_count (and the custom covering index on it from migration
--   0067 keeps working — we deliberately did NOT switch to a GENERATED column
--   because the index relies on DESC NULLS LAST + INCLUDE columns that
--   migration produced manually).
--
-- Safety / idempotency:
--   - The ADD COLUMN statements below are emitted by drizzle-kit.
--   - The seed UPDATE only touches rows where aurora_ascensionist_count IS
--     NULL, so re-running is a no-op after the first apply.
--   - The recompute pass uses ON CONFLICT semantics implicitly: the WHERE
--     clause restricts to rows that actually exist.
--   - The two backfill UPDATEs run inside an explicit BEGIN/COMMIT block.
--     Drizzle's migrator already wraps each migration in a transaction, so
--     this is belt-and-suspenders against the failure mode where one
--     UPDATE succeeds and the next aborts mid-migration: either both
--     UPDATEs commit or neither does.

ALTER TABLE "board_climb_stats" ADD COLUMN "aurora_ascensionist_count" bigint;--> statement-breakpoint
ALTER TABLE "board_climb_stats" ADD COLUMN "boardsesh_ascensionist_count" bigint;--> statement-breakpoint

BEGIN;
--> statement-breakpoint

-- Seed: every count in the table today was written by the Aurora sync.
-- Migrate that into the new aurora-owned column.
UPDATE board_climb_stats
   SET aurora_ascensionist_count = ascensionist_count
 WHERE aurora_ascensionist_count IS NULL;
--> statement-breakpoint

-- Backfill the Boardsesh contribution for every climb that already has
-- flash/send ticks. After this runs, ascensionist_count reflects the true
-- sum (Aurora + distinct Boardsesh senders) for every existing climb.
--
-- FA fields use the same ownership-aware logic as the runtime recompute in
-- packages/backend/src/graphql/resolvers/ticks/recompute-climb-stats.ts:
-- for Boardsesh-originated climbs (board_climbs.user_id IS NOT NULL) the
-- FA is re-derived from the current ticks; for Aurora-synced climbs the
-- existing Aurora FA is preserved and only filled when NULL.
WITH affected AS (
  SELECT DISTINCT board_type, climb_uuid, angle
    FROM boardsesh_ticks
   WHERE status IN ('flash', 'send')
),
agg AS (
  SELECT a.board_type,
         a.climb_uuid,
         a.angle,
         COUNT(DISTINCT bt.user_id) AS distinct_senders,
         MIN(bt.climbed_at)         AS first_at,
         (SELECT COALESCE(up.display_name, u.name)
            FROM boardsesh_ticks bt2
            JOIN users           u  ON u.id      = bt2.user_id
       LEFT JOIN user_profiles   up ON up.user_id = u.id
           WHERE bt2.board_type = a.board_type
             AND bt2.climb_uuid = a.climb_uuid
             AND bt2.angle      = a.angle
             AND bt2.status IN ('flash','send')
           ORDER BY bt2.climbed_at ASC
           LIMIT 1) AS first_user
    FROM affected a
    JOIN boardsesh_ticks bt
      ON bt.board_type = a.board_type
     AND bt.climb_uuid = a.climb_uuid
     AND bt.angle      = a.angle
     AND bt.status IN ('flash','send')
   GROUP BY a.board_type, a.climb_uuid, a.angle
)
UPDATE board_climb_stats s
   SET boardsesh_ascensionist_count = COALESCE(agg.distinct_senders, 0),
       ascensionist_count           = COALESCE(s.aurora_ascensionist_count, 0)
                                    + COALESCE(agg.distinct_senders, 0),
       fa_username = CASE
         WHEN COALESCE(
                (SELECT bc.user_id IS NOT NULL
                   FROM board_climbs bc
                  WHERE bc.board_type = agg.board_type
                    AND bc.uuid       = agg.climb_uuid),
                FALSE
              )
           THEN agg.first_user
         ELSE COALESCE(s.fa_username, agg.first_user)
       END,
       fa_at = CASE
         WHEN COALESCE(
                (SELECT bc.user_id IS NOT NULL
                   FROM board_climbs bc
                  WHERE bc.board_type = agg.board_type
                    AND bc.uuid       = agg.climb_uuid),
                FALSE
              )
           THEN agg.first_at
         ELSE COALESCE(s.fa_at, agg.first_at)
       END
  FROM agg
 WHERE s.board_type = agg.board_type
   AND s.climb_uuid = agg.climb_uuid
   AND s.angle      = agg.angle;
--> statement-breakpoint

COMMIT;
