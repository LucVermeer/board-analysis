import { sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { gyms, users } from '@boardsesh/db/schema';
import {
  boardUuidForSource,
  gymUuidForSource,
  shortHash,
  slugifyLocationName,
  SYSTEM_USER_EMAIL,
  SYSTEM_USER_ID,
} from './ids';
import { isValidCoordinate } from './coords';
import type { LocationSyncSummary, PublicBoardLocationInput, SkippedLocationRecord } from './types';

type DrizzleDb = PgDatabase<PgQueryResultHKT, Record<string, unknown>>;

type ValidBoardLocation = PublicBoardLocationInput & {
  latitude: number;
  longitude: number;
};

async function ensureSystemUser(db: DrizzleDb): Promise<void> {
  await db
    .insert(users)
    .values({
      id: SYSTEM_USER_ID,
      email: SYSTEM_USER_EMAIL,
      name: 'Boardsesh',
    })
    .onConflictDoNothing({ target: users.id });
}

function collectValidRecords(records: PublicBoardLocationInput[]): {
  validRecords: ValidBoardLocation[];
  skipped: SkippedLocationRecord[];
} {
  const validRecords: ValidBoardLocation[] = [];
  const skipped: SkippedLocationRecord[] = [];

  for (const record of records) {
    if (!isValidCoordinate(record.latitude, record.longitude)) {
      skipped.push({ sourceKey: record.sourceKey, reason: 'invalid coordinates' });
      continue;
    }
    validRecords.push(record as ValidBoardLocation);
  }

  return { validRecords, skipped };
}

export async function upsertPublicBoardLocations(
  db: DrizzleDb,
  records: PublicBoardLocationInput[],
): Promise<LocationSyncSummary> {
  await ensureSystemUser(db);

  const { validRecords, skipped } = collectValidRecords(records);
  const gymsBySource = new Map<string, ValidBoardLocation>();
  for (const record of validRecords) {
    if (!gymsBySource.has(record.gymSourceKey)) {
      gymsBySource.set(record.gymSourceKey, record);
    }
  }

  const gymIdBySource = new Map<string, number>();
  for (const [sourceKey, record] of gymsBySource) {
    const gymUuid = gymUuidForSource(sourceKey);
    const gymSlug = slugifyLocationName(record.gymName, shortHash(sourceKey));
    const [upsertedGym] = await db
      .insert(gyms)
      .values({
        uuid: gymUuid,
        slug: gymSlug,
        ownerId: SYSTEM_USER_ID,
        name: record.gymName,
        address: record.gymAddress,
        latitude: record.latitude,
        longitude: record.longitude,
        isPublic: true,
      })
      .onConflictDoUpdate({
        target: gyms.uuid,
        set: {
          slug: sql`excluded.slug`,
          name: sql`excluded.name`,
          address: sql`excluded.address`,
          latitude: sql`excluded.latitude`,
          longitude: sql`excluded.longitude`,
          isPublic: true,
          updatedAt: sql`NOW()`,
          deletedAt: null,
        },
      })
      .returning({ id: gyms.id });

    if (upsertedGym) {
      gymIdBySource.set(sourceKey, upsertedGym.id);
    }
  }

  let boardsUpserted = 0;
  for (const record of validRecords) {
    const gymId = gymIdBySource.get(record.gymSourceKey) ?? null;
    const boardUuid = boardUuidForSource(record.sourceKey);
    const boardSlug = slugifyLocationName(record.slugBase, boardUuid);

    await db.execute(sql`
      INSERT INTO user_boards (
        uuid, slug, owner_id, board_type, layout_id, size_id, set_ids,
        name, location_name, latitude, longitude, location,
        is_public, is_unlisted, hide_location, is_owned, angle,
        is_angle_adjustable, serial_number, gym_id, created_at, updated_at
      ) VALUES (
        ${boardUuid}, ${boardSlug}, ${SYSTEM_USER_ID},
        ${record.boardType}, ${record.layoutId}, ${record.sizeId}, ${record.setIds},
        ${record.name}, ${record.locationName}, ${record.latitude}, ${record.longitude},
        ST_MakePoint(${record.longitude}, ${record.latitude})::geography,
        true, false, false, false, ${record.angle},
        ${record.isAngleAdjustable}, ${record.serialNumber ?? null}, ${gymId}, NOW(), NOW()
      )
      ON CONFLICT (uuid) DO UPDATE SET
        slug = EXCLUDED.slug,
        board_type = EXCLUDED.board_type,
        layout_id = EXCLUDED.layout_id,
        size_id = EXCLUDED.size_id,
        set_ids = EXCLUDED.set_ids,
        name = EXCLUDED.name,
        location_name = EXCLUDED.location_name,
        latitude = EXCLUDED.latitude,
        longitude = EXCLUDED.longitude,
        location = EXCLUDED.location,
        is_public = EXCLUDED.is_public,
        is_unlisted = EXCLUDED.is_unlisted,
        hide_location = EXCLUDED.hide_location,
        is_owned = EXCLUDED.is_owned,
        angle = EXCLUDED.angle,
        is_angle_adjustable = EXCLUDED.is_angle_adjustable,
        serial_number = EXCLUDED.serial_number,
        gym_id = EXCLUDED.gym_id,
        updated_at = NOW(),
        deleted_at = NULL
    `);
    boardsUpserted += 1;
  }

  return {
    boardsSeen: records.length,
    boardsUpserted,
    boardsSkipped: skipped.length,
    gymsSeen: gymsBySource.size,
    gymsUpserted: gymIdBySource.size,
    skipped,
  };
}
