// Integration test for issue #3715: a MoonBoard pin move must NOT mint a
// duplicate gym.
//
// Before the fix, the gym/board source key embedded the pin's full-precision
// coordinates (`moonboard:<name>:<lat>:<lng>`), so any coordinate change produced
// a new key. A move > 20 m then tripped the same-provider guard (or missed the
// 150 m radius entirely) and minted a permanent twin gym. The fix keys on the
// normalized name + a coarse ~1.1 km cell, so a realistic pin correction keeps
// the same key and resolves back to the same gym via the source alias.
//
// This test drives the real `upsertPublicBoardLocations` against a migrated
// Postgres (the dev DB). It self-skips when DATABASE_URL is not a local database,
// and runs entirely inside a transaction that is always rolled back, so it never
// leaves rows behind. Run locally with:
//
//   DATABASE_URL=postgres://…@localhost:5432/… VITEST_POOL_ID=solo-issue3715 \
//     vp test run --reporter=agent packages/moonboard-sync/src/sync/locations-sync.integration.test.ts

import { describe, it, expect } from 'vitest';
import { sql } from 'drizzle-orm';
import { createDb, closePool, executeRows } from '@boardsesh/db/client';
import { upsertPublicBoardLocations } from '@boardsesh/location-sync';
import { buildMoonBoardLocationRecords } from './locations-sync';
import type { MoonBoardMarker } from '../api/moonboard-client';

function localDatabaseUrl(): string | null {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return null;
  }
  const hostname = new URL(databaseUrl).hostname.toLowerCase();
  return ['localhost', '127.0.0.1', 'postgres'].includes(hostname) ? databaseUrl : null;
}

function marker(name: string, latitude: number, longitude: number): MoonBoardMarker {
  return { Name: name, Latitude: latitude, Longitude: longitude, LatLng: [latitude, longitude] };
}

const describeIntegration = localDatabaseUrl() ? describe : describe.skip;

describeIntegration('MoonBoard pin move does not mint a duplicate gym (issue #3715)', () => {
  it('keeps one gym across 50 m and 500 m pin corrections', async (testContext) => {
    const db = createDb();

    // Cheap availability probe: the source-alias table must exist (migrated DB).
    try {
      const [schema] = await executeRows<{ aliasTable: string | null }>(
        db,
        sql`SELECT to_regclass('public.location_sync_gym_sources')::text AS "aliasTable"`,
      );
      if (!schema?.aliasTable) {
        testContext.skip();
        return;
      }
    } catch {
      // DB unreachable / not migrated — treat as "not available" and skip.
      testContext.skip();
      return;
    }

    const tag = `mb-3715-${Date.now()}`;
    const gymName = `Integration MoonBoard ${tag}`;

    // A cell centre (51.50, -0.10) so that a +500 m northward move (0.0045 deg,
    // rounds to the same integer-hundredths cell) stays inside one identity key.
    const startLat = 51.5;
    const startLng = -0.1;
    const records1 = buildMoonBoardLocationRecords([marker(gymName, startLat, startLng)]);
    const records2 = buildMoonBoardLocationRecords([marker(gymName, startLat + 0.00045, startLng)]); // ~50 m N
    const records3 = buildMoonBoardLocationRecords([marker(gymName, startLat + 0.0045, startLng)]); // ~500 m N

    const gymSourceKey = records1[0]?.gymSourceKey;
    expect(gymSourceKey).toBe(`moonboard:integration moonboard ${tag}:5150:-10`);
    // The coarse cell is identical across all three positions — the core invariant.
    expect(records2[0]?.gymSourceKey).toBe(gymSourceKey);
    expect(records3[0]?.gymSourceKey).toBe(gymSourceKey);

    const rollback = new Error('rollback issue-3715 integration fixture');
    try {
      await db.transaction(async (transaction) => {
        const runSync = async (records: typeof records1) => {
          await upsertPublicBoardLocations(transaction as unknown as typeof db, records);
        };

        const gymCount = async (): Promise<number> => {
          const [row] = await executeRows<{ n: number | string }>(
            transaction,
            sql`SELECT count(*)::int AS n FROM gyms WHERE name = ${gymName} AND deleted_at IS NULL`,
          );
          return Number(row?.n ?? 0);
        };

        await runSync(records1);
        expect(await gymCount()).toBe(1);

        await runSync(records2); // +50 m
        expect(await gymCount()).toBe(1);

        await runSync(records3); // +500 m
        expect(await gymCount()).toBe(1);

        // Exactly one gym, reached through exactly one moonboard source alias.
        const [aliasSummary] = await executeRows<{ gyms: number | string; aliases: number | string }>(
          transaction,
          sql`
            SELECT count(DISTINCT s.gym_id)::int AS gyms, count(*)::int AS aliases
            FROM location_sync_gym_sources s
            JOIN gyms g ON g.id = s.gym_id
            WHERE g.name = ${gymName} AND s.source_key LIKE 'moonboard:%'
          `,
        );
        expect(Number(aliasSummary?.gyms)).toBe(1);
        expect(Number(aliasSummary?.aliases)).toBe(1);

        // The gym's coordinates were refreshed to the latest pin, not left stale.
        const [coords] = await executeRows<{ lat: number | string; lng: number | string }>(
          transaction,
          sql`SELECT latitude::float8 AS lat, longitude::float8 AS lng FROM gyms WHERE name = ${gymName} AND deleted_at IS NULL`,
        );
        expect(Number(coords?.lat)).toBeCloseTo(startLat + 0.0045, 4);
        expect(Number(coords?.lng)).toBeCloseTo(startLng, 4);

        throw rollback;
      });
    } catch (error: unknown) {
      if (error !== rollback) {
        throw error;
      }
    } finally {
      await closePool();
    }
  });
});
