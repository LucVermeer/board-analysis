import { afterEach, beforeAll, describe, expect, it } from 'vite-plus/test';
import { sql } from 'drizzle-orm';
import { importJsonExportData } from '@boardsesh/aurora-sync/json-import';
import { db } from '../db/client';
import { setupWorkerDatabase } from './worker-db';

/**
 * #3301 — the live Aurora backend (Tension / TB2) delivers a unified logbook in
 * the export's `ascents` array and flags a never-sent bid with `is_ascent:
 * false`. The old importer classified purely by array membership, so every one
 * of those attempts was imported as a `send`. These tests cover the fix
 * (classify by the per-record flag) and the self-healing remediation (a
 * re-import flips a previously-mislabeled send to an attempt in place).
 */

const USER_ID = 'ai3301-user';
const BOARD = 'tension';
const CLIMB_UUID = 'ai3301-climb-uuid';
const CLIMB_NAME = 'Reclassify Test Climb';
const ANGLE = 40;

// A drizzle postgres-js handle satisfies importJsonExportData's PgDatabase
// surface; the cast just crosses the generic boundary.
const importDb = db as unknown as Parameters<typeof importJsonExportData>[0];

type ExportOverrides = Partial<{
  ascents: Array<Record<string, unknown>>;
  attempts: Array<Record<string, unknown>>;
}>;

function exportPayload(overrides: ExportOverrides = {}) {
  return {
    user: { username: 'ai3301' },
    ascents: overrides.ascents ?? [],
    attempts: overrides.attempts ?? [],
    circuits: [],
    climbs: [],
    likes: [],
  } as unknown as Parameters<typeof importJsonExportData>[3];
}

function ascentRecord(overrides: Record<string, unknown> = {}) {
  return {
    climb: CLIMB_NAME,
    angle: ANGLE,
    count: 2,
    stars: 3,
    climbed_at: '2026-06-01 10:00:00',
    created_at: '2026-06-01 10:05:00',
    grade: '7a',
    ...overrides,
  };
}

function attemptRecord(overrides: Record<string, unknown> = {}) {
  return {
    climb: CLIMB_NAME,
    angle: ANGLE,
    count: 3,
    climbed_at: '2026-06-02 11:00:00',
    created_at: '2026-06-02 11:05:00',
    ...overrides,
  };
}

async function ticksForUser() {
  const rows = (await db.execute(sql`
    SELECT uuid, status, attempt_count, quality, difficulty, aurora_type, origin, climbed_at
    FROM boardsesh_ticks
    WHERE user_id = ${USER_ID} AND board_type = ${BOARD}
    ORDER BY climbed_at
  `)) as unknown as Array<{
    uuid: string;
    status: string;
    attempt_count: number;
    quality: number | null;
    difficulty: number | null;
    aurora_type: string | null;
    origin: string;
    climbed_at: string;
  }>;
  return Array.isArray(rows) ? rows : (((rows as { rows?: unknown[] }).rows as typeof rows) ?? []);
}

beforeAll(async () => {
  await setupWorkerDatabase();
  // importJsonExportData upserts ON CONFLICT (aurora_id); guarantee the arbiter
  // index exists (canonically declared in schema-sql.ts) so the test doesn't
  // depend on apply ordering.
  await db.execute(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS boardsesh_ticks_aurora_id_unique ON boardsesh_ticks (aurora_id)`,
  );
  await db.execute(sql`
    INSERT INTO users (id, email, name, created_at, updated_at)
    VALUES (${USER_ID}, ${USER_ID + '@test.com'}, 'Reclassify Tester', now(), now())
    ON CONFLICT (id) DO NOTHING
  `);
  // A listed catalog climb so the export's climb name resolves to a uuid.
  await db.execute(sql`
    INSERT INTO board_climbs (uuid, board_type, layout_id, setter_username, name, frames, frames_count, is_draft, is_listed, edge_left, edge_right, edge_bottom, edge_top, created_at)
    VALUES (${CLIMB_UUID}, ${BOARD}, 1, 'test-setter', ${CLIMB_NAME}, 'p1r1', 1, false, true, 0, 100, 0, 150, '2024-01-01')
    ON CONFLICT (uuid) DO NOTHING
  `);
});

afterEach(async () => {
  await db.execute(sql`DELETE FROM boardsesh_ticks WHERE user_id = ${USER_ID}`);
});

describe('aurora import — #3301 merged-shape reclassification', () => {
  it('classifies an is_ascent=false record inside ascents as an attempt, not a send', async () => {
    await importJsonExportData(
      importDb,
      USER_ID,
      BOARD,
      exportPayload({
        ascents: [
          ascentRecord({ is_ascent: true, climbed_at: '2026-06-01 10:00:00' }),
          ascentRecord({ is_ascent: false, tries: 4, climbed_at: '2026-06-03 12:00:00' }),
        ],
      }),
    );

    const rows = await ticksForUser();
    expect(rows).toHaveLength(2);

    const send = rows.find((r) => r.climbed_at.startsWith('2026-06-01'));
    const attempt = rows.find((r) => r.climbed_at.startsWith('2026-06-03'));

    expect(send?.status === 'send' || send?.status === 'flash').toBe(true);
    expect(send?.aurora_type).toBe('ascents');

    // The is_ascent=false row must land as an attempt with no star/grade and the
    // `tries` count, not a send.
    expect(attempt?.status).toBe('attempt');
    expect(attempt?.aurora_type).toBe('bids');
    expect(attempt?.quality).toBeNull();
    expect(attempt?.difficulty).toBeNull();
    expect(attempt?.attempt_count).toBe(4);
  });

  it('leaves the legacy Kilter shape (separate arrays, no is_ascent) unchanged', async () => {
    await importJsonExportData(
      importDb,
      USER_ID,
      BOARD,
      exportPayload({
        ascents: [ascentRecord({ climbed_at: '2026-06-01 10:00:00' })],
        attempts: [attemptRecord({ climbed_at: '2026-06-02 11:00:00' })],
      }),
    );

    const rows = await ticksForUser();
    expect(rows).toHaveLength(2);
    const send = rows.find((r) => r.climbed_at.startsWith('2026-06-01'));
    const attempt = rows.find((r) => r.climbed_at.startsWith('2026-06-02'));
    expect(send?.status === 'send' || send?.status === 'flash').toBe(true);
    expect(attempt?.status).toBe('attempt');
  });

  it('self-heals a previously-mislabeled send on re-import (UPDATE in place, never a delete or twin)', async () => {
    // First import reproduces the OLD bug: the record arrives with no is_ascent
    // flag, so it is written as a send.
    await importJsonExportData(
      importDb,
      USER_ID,
      BOARD,
      exportPayload({
        ascents: [ascentRecord({ climbed_at: '2026-06-05 09:00:00' })],
      }),
    );

    let rows = await ticksForUser();
    expect(rows).toHaveLength(1);
    expect(rows[0].status === 'send' || rows[0].status === 'flash').toBe(true);
    const originalUuid = rows[0].uuid;

    // Re-import the SAME record, now correctly flagged is_ascent=false. The
    // fixed importer classifies it as an attempt and heals the stale send.
    const reimport = await importJsonExportData(
      importDb,
      USER_ID,
      BOARD,
      exportPayload({
        ascents: [ascentRecord({ is_ascent: false, tries: 6, climbed_at: '2026-06-05 09:00:00' })],
      }),
    );

    // The record dedups against the existing (now-healed) row, so it is skipped
    // rather than inserted as a twin — the heal is the UPDATE, not an insert.
    expect(reimport.attempts.imported).toBe(0);
    expect(reimport.attempts.skipped).toBe(1);
    expect(reimport.ascents.imported).toBe(0);

    rows = await ticksForUser();
    // No twin inserted — still exactly one row, and it's the SAME row (not deleted).
    expect(rows).toHaveLength(1);
    expect(rows[0].uuid).toBe(originalUuid);
    // Flipped in place to an attempt.
    expect(rows[0].status).toBe('attempt');
    expect(rows[0].aurora_type).toBe('bids');
    expect(rows[0].quality).toBeNull();
    expect(rows[0].difficulty).toBeNull();
    expect(rows[0].attempt_count).toBe(6);
  });
});
