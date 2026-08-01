import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { closePool, createDb, executeRows } from '@boardsesh/db/client';
import { upsertPublicBoardLocations } from './upsert';
import type { PublicBoardLocationInput } from './types';
import { boardUuidForSource, gymUuidForSource } from './ids';
import { resolveLocationSyncIntegrationConfig } from './integration-test-config';

/**
 * Real-DB integration test proving the sync-freeze guards: once a human curates
 * a synced gym/board (setting sync_frozen_at), a subsequent location sync must
 * NOT overwrite its metadata — while still keeping the source alias and the
 * board→gym link current. An unfrozen synced row must still update normally.
 *
 * Local runs are opt-in and self-skip without an eligible DATABASE_URL. The
 * dedicated CI job sets REQUIRE_LOCATION_SYNC_INTEGRATION=1, which turns every
 * missing/invalid prerequisite into a hard failure. Everything runs inside a
 * transaction that is rolled back, leaving no residue.
 */
const integrationConfig = resolveLocationSyncIntegrationConfig(process.env);

type GymStateRow = {
  id: number | string;
  name: string;
  latitude: number | string | null;
  longitude: number | string | null;
  isPublic: boolean;
  deletedAt: Date | string | null;
  syncFrozenAt: Date | string | null;
};

type BoardStateRow = {
  name: string;
  latitude: number | string | null;
  gymId: number | string | null;
  syncFrozenAt: Date | string | null;
};

type AliasRow = { gymId: number | string };

type PrerequisiteRow = {
  hasPostgis: boolean;
  hasGymsTable: boolean;
  hasBoardsTable: boolean;
  hasAliasesTable: boolean;
  hasGymFreezeColumn: boolean;
  hasBoardFreezeColumn: boolean;
  hasGymLocationColumn: boolean;
  hasBoardLocationColumn: boolean;
  hasGymLocationTrigger: boolean;
  hasBoardLocationTrigger: boolean;
};

function baseRecord(overrides: Partial<PublicBoardLocationInput>): PublicBoardLocationInput {
  return {
    boardType: 'tension',
    layoutId: 10,
    sizeId: 6,
    setIds: '12,13',
    angle: 40,
    isAngleAdjustable: true,
    sourceKey: 'tension:freeze-board',
    gymSourceKey: 'tension:freeze-gym',
    name: 'Upstream Board',
    slugBase: 'Upstream Board-tension',
    locationName: null,
    latitude: -33.86,
    longitude: 151.2,
    gymName: 'Upstream Gym',
    gymAddress: null,
    ...overrides,
  };
}

async function readGym(tx: Parameters<typeof upsertPublicBoardLocations>[0], uuid: string): Promise<GymStateRow> {
  const [row] = await executeRows<GymStateRow>(
    tx,
    sql`SELECT id, name, latitude, longitude, is_public AS "isPublic", deleted_at AS "deletedAt",
               sync_frozen_at AS "syncFrozenAt"
        FROM gyms WHERE uuid = ${uuid} LIMIT 1`,
  );
  expect(row, `expected a gyms row for ${uuid}`).toBeTruthy();
  return row;
}

async function readBoard(tx: Parameters<typeof upsertPublicBoardLocations>[0], uuid: string): Promise<BoardStateRow> {
  const [row] = await executeRows<BoardStateRow>(
    tx,
    sql`SELECT name, latitude, gym_id AS "gymId", sync_frozen_at AS "syncFrozenAt"
        FROM user_boards WHERE uuid = ${uuid} LIMIT 1`,
  );
  expect(row, `expected a user_boards row for ${uuid}`).toBeTruthy();
  return row;
}

describe.skipIf(integrationConfig.databaseUrl === null)('location sync freeze guards (integration)', () => {
  beforeAll(async () => {
    const db = createDb();
    const [prerequisites] = await executeRows<PrerequisiteRow>(
      db,
      sql`SELECT
            EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') AS "hasPostgis",
            to_regclass('public.gyms') IS NOT NULL AS "hasGymsTable",
            to_regclass('public.user_boards') IS NOT NULL AS "hasBoardsTable",
            to_regclass('public.location_sync_gym_sources') IS NOT NULL AS "hasAliasesTable",
            EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'gyms' AND column_name = 'sync_frozen_at'
            ) AS "hasGymFreezeColumn",
            EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'user_boards' AND column_name = 'sync_frozen_at'
            ) AS "hasBoardFreezeColumn",
            EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'gyms' AND column_name = 'location'
                AND udt_name = 'geography'
            ) AS "hasGymLocationColumn",
            EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'user_boards' AND column_name = 'location'
                AND udt_name = 'geography'
            ) AS "hasBoardLocationColumn",
            EXISTS (
              SELECT 1 FROM pg_trigger
              WHERE tgname = 'gyms_set_location' AND tgrelid = 'public.gyms'::regclass
                AND NOT tgisinternal AND tgenabled <> 'D'
            ) AS "hasGymLocationTrigger",
            EXISTS (
              SELECT 1 FROM pg_trigger
              WHERE tgname = 'user_boards_set_location'
                AND tgrelid = 'public.user_boards'::regclass
                AND NOT tgisinternal AND tgenabled <> 'D'
            ) AS "hasBoardLocationTrigger"`,
    );

    expect(prerequisites, 'expected the location-sync prerequisite query to return one row').toBeTruthy();
    const missingPrerequisites = Object.entries(prerequisites ?? {})
      .filter(([, isPresent]) => !isPresent)
      .map(([name]) => name);
    expect(missingPrerequisites, 'location-sync integration database is missing required schema').toEqual([]);
  });

  afterAll(async () => {
    await closePool();
  });

  it('never overwrites a human-curated gym/board, but keeps alias + link current', async () => {
    const db = createDb();
    const rollback = new Error('rollback freeze fixture');

    await db
      .transaction(async (tx) => {
        const fixtureId = randomUUID();
        const gymSourceKey = `tension:freeze-gym-${fixtureId}`;
        const boardSourceKey = `tension:freeze-board-${fixtureId}`;
        const gymUuid = gymUuidForSource(gymSourceKey);
        const boardUuid = boardUuidForSource(boardSourceKey);

        // 1. Initial sync creates the gym, board, and source alias.
        await upsertPublicBoardLocations(tx, [
          baseRecord({
            sourceKey: boardSourceKey,
            gymSourceKey,
            gymName: 'Upstream Gym',
            name: 'Upstream Board',
            latitude: -33.86,
            longitude: 151.2,
          }),
        ]);

        const seededGym = await readGym(tx, gymUuid);
        expect(seededGym.syncFrozenAt).toBeNull();

        // 2. A human curates both rows and freezes them.
        await tx.execute(sql`
          UPDATE gyms
             SET name = 'Human Gym', latitude = 1.11, longitude = 2.22, sync_frozen_at = NOW()
           WHERE uuid = ${gymUuid}
        `);
        await tx.execute(sql`
          UPDATE user_boards
             SET name = 'Human Board', sync_frozen_at = NOW()
           WHERE uuid = ${boardUuid}
        `);

        // 3. A later sync arrives with DIFFERENT upstream values.
        await upsertPublicBoardLocations(tx, [
          baseRecord({
            sourceKey: boardSourceKey,
            gymSourceKey,
            gymName: 'Upstream Gym CHANGED',
            name: 'Upstream Board CHANGED',
            latitude: -34.99,
            longitude: 150.01,
          }),
        ]);

        // 4. The human edits survived; the sync did not overwrite them.
        const frozenGym = await readGym(tx, gymUuid);
        expect(frozenGym.name).toBe('Human Gym');
        expect(Number(frozenGym.latitude)).toBeCloseTo(1.11, 5);
        expect(Number(frozenGym.longitude)).toBeCloseTo(2.22, 5);
        expect(frozenGym.syncFrozenAt).not.toBeNull();

        const frozenBoard = await readBoard(tx, boardUuid);
        expect(frozenBoard.name).toBe('Human Board');
        // The board's lat was NOT touched by the human but is frozen, so it must
        // still hold the ORIGINAL synced value, not the CHANGED one.
        expect(Number(frozenBoard.latitude)).toBeCloseTo(-33.86, 5);
        expect(frozenBoard.syncFrozenAt).not.toBeNull();

        // 5. Linking is still intact: the alias resolves and the board points at
        // the (frozen) gym.
        const [alias] = await executeRows<AliasRow>(
          tx,
          sql`SELECT gym_id AS "gymId" FROM location_sync_gym_sources WHERE source_key = ${gymSourceKey} LIMIT 1`,
        );
        expect(alias, 'expected a source alias row').toBeTruthy();
        expect(Number(alias.gymId)).toBe(Number(frozenGym.id));
        expect(Number(frozenBoard.gymId)).toBe(Number(frozenGym.id));

        throw rollback;
      })
      .catch((error: unknown) => {
        if (error !== rollback) {
          throw error;
        }
      });
  });

  it('still refreshes an unfrozen synced gym on re-sync (guard does not over-block)', async () => {
    const db = createDb();
    const rollback = new Error('rollback open fixture');

    await db
      .transaction(async (tx) => {
        const fixtureId = randomUUID();
        const gymSourceKey = `tension:open-gym-${fixtureId}`;
        const boardSourceKey = `tension:open-board-${fixtureId}`;
        const gymUuid = gymUuidForSource(gymSourceKey);

        await upsertPublicBoardLocations(tx, [
          baseRecord({
            sourceKey: boardSourceKey,
            gymSourceKey,
            gymName: 'Open Gym',
            latitude: -33.86,
            longitude: 151.2,
          }),
        ]);

        // No human edit / no freeze — a re-sync with new upstream values must win.
        await upsertPublicBoardLocations(tx, [
          baseRecord({
            sourceKey: boardSourceKey,
            gymSourceKey,
            gymName: 'Open Gym CHANGED',
            latitude: -35.5,
            longitude: 149.9,
          }),
        ]);

        const gym = await readGym(tx, gymUuid);
        expect(gym.name).toBe('Open Gym CHANGED');
        expect(Number(gym.latitude)).toBeCloseTo(-35.5, 5);
        expect(gym.syncFrozenAt).toBeNull();

        throw rollback;
      })
      .catch((error: unknown) => {
        if (error !== rollback) {
          throw error;
        }
      });
  });
});
