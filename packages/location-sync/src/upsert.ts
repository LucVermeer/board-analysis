import { sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { gyms, userBoards, users } from '@boardsesh/db/schema';
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

export type ValidBoardLocation = PublicBoardLocationInput & {
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

export function collectValidLocationRecords(records: PublicBoardLocationInput[]): {
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

export function collectUniqueGymLocationRecords(validRecords: ValidBoardLocation[]): Map<string, ValidBoardLocation> {
  const gymsBySource = new Map<string, ValidBoardLocation>();
  for (const record of validRecords) {
    if (!gymsBySource.has(record.gymSourceKey)) {
      gymsBySource.set(record.gymSourceKey, record);
    }
  }
  return gymsBySource;
}

export function buildLocationUpsertPlan(records: PublicBoardLocationInput[]): {
  validRecords: ValidBoardLocation[];
  skipped: SkippedLocationRecord[];
  gymsBySource: Map<string, ValidBoardLocation>;
} {
  const { validRecords, skipped } = collectValidLocationRecords(records);
  return {
    validRecords,
    skipped,
    gymsBySource: collectUniqueGymLocationRecords(validRecords),
  };
}

export function buildGymWriteIdentifiers(
  sourceKey: string,
  record: ValidBoardLocation,
): {
  uuid: string;
  slug: string;
} {
  return {
    uuid: gymUuidForSource(sourceKey),
    slug: slugifyLocationName(record.gymName, shortHash(sourceKey)),
  };
}

export function buildBoardWriteIdentifiers(record: ValidBoardLocation): {
  uuid: string;
  slug: string;
} {
  const uuid = boardUuidForSource(record.sourceKey);
  return {
    uuid,
    slug: slugifyLocationName(record.slugBase, uuid),
  };
}

export async function upsertPublicBoardLocations(
  db: DrizzleDb,
  records: PublicBoardLocationInput[],
): Promise<LocationSyncSummary> {
  await ensureSystemUser(db);

  const { validRecords, skipped, gymsBySource } = buildLocationUpsertPlan(records);

  const gymIdBySource = new Map<string, number>();
  for (const [sourceKey, record] of gymsBySource) {
    const gymIdentifiers = buildGymWriteIdentifiers(sourceKey, record);
    const [upsertedGym] = await db
      .insert(gyms)
      .values({
        uuid: gymIdentifiers.uuid,
        slug: gymIdentifiers.slug,
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
          slug: sql`COALESCE(${gyms.slug}, excluded.slug)`,
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
      // The PostGIS `location` geography is derived from lat/lng by the
      // gyms_set_location trigger (migration 0127), so the upsert above already
      // populated it — no separate geography write needed.
      gymIdBySource.set(sourceKey, upsertedGym.id);
    }
  }

  let boardsUpserted = 0;
  for (const record of validRecords) {
    const gymId = gymIdBySource.get(record.gymSourceKey) ?? null;
    const boardIdentifiers = buildBoardWriteIdentifiers(record);

    const [upsertedBoard] = await db
      .insert(userBoards)
      .values({
        uuid: boardIdentifiers.uuid,
        slug: boardIdentifiers.slug,
        ownerId: SYSTEM_USER_ID,
        boardType: record.boardType,
        layoutId: record.layoutId,
        sizeId: record.sizeId,
        setIds: record.setIds,
        name: record.name,
        locationName: record.locationName,
        latitude: record.latitude,
        longitude: record.longitude,
        isPublic: true,
        isUnlisted: false,
        hideLocation: false,
        isOwned: false,
        angle: record.angle,
        isAngleAdjustable: record.isAngleAdjustable,
        serialNumber: record.serialNumber ?? null,
        gymId,
      })
      .onConflictDoUpdate({
        target: userBoards.uuid,
        set: {
          slug: sql`COALESCE(${userBoards.slug}, excluded.slug)`,
          boardType: sql`excluded.board_type`,
          layoutId: sql`excluded.layout_id`,
          sizeId: sql`excluded.size_id`,
          setIds: sql`excluded.set_ids`,
          name: sql`excluded.name`,
          locationName: sql`excluded.location_name`,
          latitude: sql`excluded.latitude`,
          longitude: sql`excluded.longitude`,
          isPublic: sql`excluded.is_public`,
          isUnlisted: sql`excluded.is_unlisted`,
          hideLocation: sql`excluded.hide_location`,
          isOwned: sql`excluded.is_owned`,
          angle: sql`excluded.angle`,
          isAngleAdjustable: sql`excluded.is_angle_adjustable`,
          serialNumber: sql`excluded.serial_number`,
          gymId: sql`excluded.gym_id`,
          updatedAt: sql`NOW()`,
          deletedAt: null,
        },
      })
      .returning({ id: userBoards.id });

    if (upsertedBoard) {
      // `location` is maintained by the user_boards_set_location trigger
      // (migration 0127); the upsert's lat/lng write already set it.
      boardsUpserted += 1;
    }
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
