import { describe, it, expect, beforeAll, afterEach } from 'vite-plus/test';
import { sql } from 'drizzle-orm';
import { db } from '../db/client';
import { buildUserAuroraJsonExport } from '../services/user-data-export';

/**
 * Integration test for the alias-resolution fix in the user data export.
 *
 * The Kilter catalog dedups climbs: some `boardsesh_ticks.climb_uuid` values are
 * *alias* UUIDs (rows in `board_climb_aliases` with NO row in `board_climbs`) that
 * point at a canonical UUID. The export query previously INNER-JOINed
 * ticks -> board_climbs on the raw `climb_uuid`, so an aliased tick was silently
 * dropped from the user's data export — and even with a LEFT JOIN it would land
 * with a null `climbName`, which the export builder skips. Both are data loss.
 *
 * The fix resolves the canonical UUID via the alias table before joining
 * board_climbs (and switches to a LEFT JOIN so a tick is never dropped). This
 * test proves an aliased tick now appears in the export under the canonical name.
 */

const TEST_USER_ID = 'export-alias-test-user';
const CLIMB_PREFIX = 'export-alias-test-climb-';

const insertUser = async (id: string) => {
  await db.execute(sql`
    INSERT INTO "users" (id, email, name, created_at, updated_at)
    VALUES (${id}, ${id + '@test.com'}, ${'Test ' + id}, now(), now())
    ON CONFLICT (id) DO NOTHING
  `);
};

const insertClimb = async (uuid: string, name: string, options: { boardType?: string; layoutId?: number } = {}) => {
  const boardType = options.boardType ?? 'kilter';
  const layoutId = options.layoutId ?? 1;
  await db.execute(sql`
    INSERT INTO board_climbs (uuid, board_type, layout_id, setter_username, name, frames, frames_count, is_draft, is_listed, edge_left, edge_right, edge_bottom, edge_top, created_at)
    VALUES (${uuid}, ${boardType}, ${layoutId}, 'test-setter', ${name}, 'p1r1', 1, false, true, 0, 100, 0, 150, '2024-01-01')
    ON CONFLICT (uuid) DO NOTHING
  `);
};

const insertAlias = async (params: { aliasUuid: string; canonicalUuid: string; boardType?: string }) => {
  const boardType = params.boardType ?? 'kilter';
  await db.execute(sql`
    INSERT INTO board_climb_aliases (board_type, alias_uuid, canonical_uuid, source, first_seen_at, last_seen_at)
    VALUES (${boardType}, ${params.aliasUuid}, ${params.canonicalUuid}, 'test', now(), now())
    ON CONFLICT (board_type, alias_uuid) DO UPDATE SET canonical_uuid = excluded.canonical_uuid
  `);
};

const insertTick = async (params: {
  uuid: string;
  climbUuid: string;
  climbedAt: string;
  status: 'flash' | 'send' | 'attempt';
  attemptCount?: number;
  boardType?: string;
  difficulty?: number;
  angle?: number;
}) => {
  const attemptCount = params.attemptCount ?? 1;
  const boardType = params.boardType ?? 'kilter';
  const angle = params.angle ?? 40;
  await db.execute(sql`
    INSERT INTO boardsesh_ticks (uuid, user_id, board_type, climb_uuid, angle, status, attempt_count, difficulty, climbed_at)
    VALUES (${params.uuid}, ${TEST_USER_ID}, ${boardType}, ${params.climbUuid}, ${angle}, ${params.status}, ${attemptCount}, ${params.difficulty ?? null}, ${params.climbedAt})
  `);
};

const cleanup = async () => {
  await db.execute(sql`DELETE FROM boardsesh_ticks WHERE user_id = ${TEST_USER_ID}`);
  await db.execute(
    sql`DELETE FROM board_climb_aliases WHERE alias_uuid LIKE ${CLIMB_PREFIX + '%'} OR canonical_uuid LIKE ${CLIMB_PREFIX + '%'}`,
  );
  await db.execute(sql`DELETE FROM board_climbs WHERE uuid LIKE ${CLIMB_PREFIX + '%'}`);
};

describe('user data export — dedup-merged alias ticks', () => {
  beforeAll(async () => {
    await insertUser(TEST_USER_ID);
  });

  afterEach(async () => {
    await cleanup();
  });

  it('keeps an aliased ascent in the export under the canonical climb name', async () => {
    const canonicalUuid = CLIMB_PREFIX + 'canonical';
    const aliasUuid = CLIMB_PREFIX + 'merged-away';

    // Only the canonical exists in board_climbs; the alias UUID has no climb row.
    await insertClimb(canonicalUuid, 'The Canonical Climb');
    await insertAlias({ aliasUuid, canonicalUuid });

    // Tick points at the deduped-away alias UUID.
    await insertTick({
      uuid: 'export-alias-tick-send',
      climbUuid: aliasUuid,
      climbedAt: '2026-07-01 10:00:00',
      status: 'send',
      attemptCount: 2,
    });

    const exportPayload = await buildUserAuroraJsonExport(TEST_USER_ID, 'kilter');

    // Without alias resolution this tick is dropped entirely (INNER JOIN miss,
    // or null climbName skipped by the export builder).
    expect(exportPayload.ascents).toHaveLength(1);
    expect(exportPayload.ascents[0]).toMatchObject({
      climb: 'The Canonical Climb',
      angle: 40,
      count: 2,
    });
    expect(exportPayload.attempts).toHaveLength(0);
  });

  it('keeps an aliased attempt in the export under the canonical climb name', async () => {
    const canonicalUuid = CLIMB_PREFIX + 'canonical-attempt';
    const aliasUuid = CLIMB_PREFIX + 'merged-attempt';

    await insertClimb(canonicalUuid, 'Canonical Project');
    await insertAlias({ aliasUuid, canonicalUuid });

    await insertTick({
      uuid: 'export-alias-tick-attempt',
      climbUuid: aliasUuid,
      climbedAt: '2026-07-02 10:00:00',
      status: 'attempt',
      attemptCount: 4,
    });

    const exportPayload = await buildUserAuroraJsonExport(TEST_USER_ID, 'kilter');

    expect(exportPayload.attempts).toHaveLength(1);
    expect(exportPayload.attempts[0]).toMatchObject({
      climb: 'Canonical Project',
      angle: 40,
      count: 4,
    });
    expect(exportPayload.ascents).toHaveLength(0);
  });

  it('still exports a tick already on a canonical UUID (no alias row)', async () => {
    const canonicalUuid = CLIMB_PREFIX + 'direct-canonical';
    await insertClimb(canonicalUuid, 'Direct Canonical Climb');

    await insertTick({
      uuid: 'export-direct-tick',
      climbUuid: canonicalUuid,
      climbedAt: '2026-07-03 10:00:00',
      status: 'flash',
    });

    const exportPayload = await buildUserAuroraJsonExport(TEST_USER_ID, 'kilter');

    expect(exportPayload.ascents).toHaveLength(1);
    expect(exportPayload.ascents[0].climb).toBe('Direct Canonical Climb');
  });
});
