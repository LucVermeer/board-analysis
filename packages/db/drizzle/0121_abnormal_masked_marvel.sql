UPDATE "user_boards"
SET "serial_number" = NULLIF(BTRIM("serial_number"), '')
WHERE "serial_number" IS NOT NULL
  AND "serial_number" IS DISTINCT FROM NULLIF(BTRIM("serial_number"), '');

WITH ranked_serials AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "serial_number"
      ORDER BY "updated_at" DESC, "id" DESC
    ) AS "serial_rank"
  FROM "user_boards"
  WHERE "serial_number" IS NOT NULL
    AND "serial_number" <> ''
    AND "deleted_at" IS NULL
)
UPDATE "user_boards"
SET "serial_number" = NULL
FROM ranked_serials
WHERE "user_boards"."id" = ranked_serials."id"
  AND ranked_serials."serial_rank" > 1;

CREATE UNIQUE INDEX "user_boards_unique_serial" ON "user_boards" USING btree ("serial_number") WHERE "user_boards"."serial_number" IS NOT NULL AND "user_boards"."serial_number" <> '' AND "user_boards"."deleted_at" IS NULL;
