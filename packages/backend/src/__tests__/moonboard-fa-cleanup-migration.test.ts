import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vite-plus/test';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import { getWorkerDatabaseUrl, setupWorkerDatabase } from './worker-db';

const drizzleDir = fileURLToPath(new URL('../../../db/drizzle/', import.meta.url));
const MIGRATION_0173 = readFileSync(`${drizzleDir}0173_clear_moonboard_catalog_fa.sql`, 'utf8');

type StatsRow = {
  board_type: string;
  climb_uuid: string;
  fa_username: string | null;
  fa_at: string | null;
};

function rowsFromResult<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (typeof result === 'object' && result !== null && 'rows' in result) {
    return (result as { rows: T[] }).rows;
  }
  return [];
}

describe('MoonBoard FA cleanup migration 0173 - real DB replay', () => {
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;

  beforeAll(async () => {
    await setupWorkerDatabase();
    client = postgres(getWorkerDatabaseUrl(), { max: 1, onnotice: () => {} });
    db = drizzle(client);
  });

  afterAll(async () => {
    if (client) await client.end();
  });

  beforeEach(async () => {
    await db.execute(sql`TRUNCATE TABLE board_climb_stats, board_climbs, users RESTART IDENTITY CASCADE`);
  });

  async function seedUser(id: string): Promise<void> {
    await db.execute(sql`
      INSERT INTO users (id, email, name, created_at, updated_at)
      VALUES (${id}, ${`${id}@example.test`}, ${id}, now(), now())
    `);
  }

  async function seedClimb(args: { boardType: string; uuid: string; ownerUserId: string | null }): Promise<void> {
    await db.execute(sql`
      INSERT INTO board_climbs
        (uuid, board_type, layout_id, setter_username, name, description, frames, is_listed, user_id)
      VALUES
        (${args.uuid}, ${args.boardType}, 1, 'setter', ${args.uuid}, '', 'p1r1', true, ${args.ownerUserId})
    `);
  }

  async function seedStats(args: {
    boardType: string;
    uuid: string;
    faUsername: string | null;
    faAt: string | null;
  }): Promise<void> {
    await db.execute(sql`
      INSERT INTO board_climb_stats
        (board_type, climb_uuid, angle, ascensionist_count, upstream_ascensionist_count,
         boardsesh_ascensionist_count, quality_normalized, fa_username, fa_at)
      VALUES
        (${args.boardType}, ${args.uuid}, 40, 1, 1, 0, true, ${args.faUsername}, ${args.faAt})
    `);
  }

  async function statsRows(): Promise<StatsRow[]> {
    const result = await db.execute(sql`
      SELECT board_type, climb_uuid, fa_username, fa_at::text AS fa_at
        FROM board_climb_stats
       ORDER BY board_type, climb_uuid
    `);
    return rowsFromResult<StatsRow>(result);
  }

  async function applyMigration(): Promise<void> {
    await client.unsafe(MIGRATION_0173);
  }

  async function seedEveryBranch(): Promise<void> {
    await seedUser('owner-user');
    await seedClimb({ boardType: 'moonboard', uuid: 'moonboard-catalog', ownerUserId: null });
    await seedClimb({ boardType: 'moonboard', uuid: 'moonboard-owned', ownerUserId: 'owner-user' });
    await seedClimb({ boardType: 'kilter', uuid: 'kilter-upstream', ownerUserId: null });

    await seedStats({
      boardType: 'moonboard',
      uuid: 'moonboard-catalog',
      faUsername: 'Tick Crown',
      faAt: '2024-01-01 00:00:00',
    });
    await seedStats({
      boardType: 'moonboard',
      uuid: 'moonboard-owned',
      faUsername: 'Owned Crown',
      faAt: '2024-02-01 00:00:00',
    });
    await seedStats({
      boardType: 'kilter',
      uuid: 'kilter-upstream',
      faUsername: 'Kilter Upstream',
      faAt: '1999-05-05 12:00:00',
    });
  }

  it('clears only non-owned MoonBoard catalog FA fields and is idempotent', async () => {
    await seedEveryBranch();

    await applyMigration();
    await applyMigration();

    const rows = await statsRows();
    expect(rows).toEqual([
      {
        board_type: 'kilter',
        climb_uuid: 'kilter-upstream',
        fa_username: 'Kilter Upstream',
        fa_at: '1999-05-05 12:00:00',
      },
      {
        board_type: 'moonboard',
        climb_uuid: 'moonboard-catalog',
        fa_username: null,
        fa_at: null,
      },
      {
        board_type: 'moonboard',
        climb_uuid: 'moonboard-owned',
        fa_username: 'Owned Crown',
        fa_at: '2024-02-01 00:00:00',
      },
    ]);
  });
});
