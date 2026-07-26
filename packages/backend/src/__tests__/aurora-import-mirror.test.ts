import { afterEach, beforeAll, describe, expect, it } from 'vite-plus/test';
import { sql } from 'drizzle-orm';
import { auroraExportSchema, importJsonExportData } from '@boardsesh/aurora-sync/json-import';
import { db } from '../db/client';
import { setupWorkerDatabase } from './worker-db';

/**
 * #3521 — the export schema never declared `is_mirror`, so zod stripped it and
 * the row builder wrote every imported tick non-mirrored. A quarter of live
 * Tension ticks are mirrored, so an importing Tension climber's logbook
 * misstated orientation on roughly one climb in four.
 *
 * These tests go through `auroraExportSchema` on purpose. The unit tests cover
 * the row builder, and the sibling #3301 tests hand `importJsonExportData` an
 * already-shaped object — which means a revert of the schema half alone would
 * leave them green. Parsing first is what makes this an end-to-end assertion:
 * strip the field from the schema and these fail.
 *
 * The records are hand-built from the shapes already in this repo. No real
 * Aurora account export was available to copy (they're requested by emailing
 * Aurora support and contain personal data), so whether the real file carries
 * `is_mirror` was unverified when this landed.
 */

const USER_ID = 'ai3521-user';
const BOARD = 'tension';
const CLIMB_UUID = 'ai3521-climb-uuid';
const CLIMB_NAME = 'Mirror Test Climb';
const ANGLE = 40;

const importDb = db as unknown as Parameters<typeof importJsonExportData>[0];

type ExportOverrides = Partial<{
  ascents: Array<Record<string, unknown>>;
  attempts: Array<Record<string, unknown>>;
}>;

/** Parse through the real schema, exactly as the import handler does. */
function parsedExportPayload(overrides: ExportOverrides = {}) {
  return auroraExportSchema.parse({
    user: { username: 'ai3521' },
    ascents: overrides.ascents ?? [],
    attempts: overrides.attempts ?? [],
    circuits: [],
    climbs: [],
    likes: [],
  });
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
    SELECT uuid, status, is_mirror, aurora_id, aurora_type, updated_at, aurora_synced_at, climbed_at
    FROM boardsesh_ticks
    WHERE user_id = ${USER_ID} AND board_type = ${BOARD}
    ORDER BY climbed_at
  `)) as unknown as Array<{
    uuid: string;
    status: string;
    is_mirror: boolean | null;
    aurora_id: string | null;
    aurora_type: string | null;
    updated_at: string;
    aurora_synced_at: string | null;
    climbed_at: string;
  }>;
  return Array.isArray(rows) ? rows : (((rows as { rows?: unknown[] }).rows as typeof rows) ?? []);
}

beforeAll(async () => {
  await setupWorkerDatabase();
  await db.execute(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS boardsesh_ticks_aurora_id_unique ON boardsesh_ticks (aurora_id)`,
  );
  await db.execute(sql`
    INSERT INTO users (id, email, name, created_at, updated_at)
    VALUES (${USER_ID}, ${USER_ID + '@test.com'}, 'Mirror Tester', now(), now())
    ON CONFLICT (id) DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO board_climbs (uuid, board_type, layout_id, setter_username, name, frames, frames_count, is_draft, is_listed, edge_left, edge_right, edge_bottom, edge_top, created_at)
    VALUES (${CLIMB_UUID}, ${BOARD}, 1, 'test-setter', ${CLIMB_NAME}, 'p1r1', 1, false, true, 0, 100, 0, 150, '2024-01-01')
    ON CONFLICT (uuid) DO NOTHING
  `);
});

afterEach(async () => {
  await db.execute(sql`DELETE FROM boardsesh_ticks WHERE user_id = ${USER_ID}`);
});

describe('aurora import — #3521 mirrored ascents', () => {
  it('imports a mirrored send as mirrored', async () => {
    await importJsonExportData(
      importDb,
      USER_ID,
      BOARD,
      parsedExportPayload({ ascents: [ascentRecord({ is_mirror: true })] }),
    );

    const rows = await ticksForUser();
    expect(rows).toHaveLength(1);
    expect(rows[0].is_mirror).toBe(true);
  });

  it('imports a mirrored attempt as mirrored, including a merged-shape TB2 bid', async () => {
    await importJsonExportData(
      importDb,
      USER_ID,
      BOARD,
      parsedExportPayload({
        attempts: [attemptRecord({ is_mirror: true })],
        // The live Tension/TB2 shape: a never-sent bid delivered inside
        // `ascents` with is_ascent: false. It reaches the attempt path through
        // exportAscentToAttempt, which has to carry orientation with it.
        ascents: [ascentRecord({ is_ascent: false, tries: 4, is_mirror: true, climbed_at: '2026-06-03 12:00:00' })],
      }),
    );

    const rows = await ticksForUser();
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.is_mirror === true)).toBe(true);
    expect(rows.every((row) => row.aurora_type === 'bids')).toBe(true);
  });

  it('leaves a record with no mirror field non-mirrored (every legacy Kilter export)', async () => {
    await importJsonExportData(importDb, USER_ID, BOARD, parsedExportPayload({ ascents: [ascentRecord()] }));

    const rows = await ticksForUser();
    expect(rows).toHaveLength(1);
    expect(rows[0].is_mirror).toBe(false);
  });

  it('heals a pre-fix non-mirrored row on re-import, in place and without a twin', async () => {
    // Stands in for the state the old importer left behind: a tick stored
    // non-mirrored for a climb the user actually climbed mirrored. Reached here
    // by importing a record with no flag, since the pre-fix code path (zod
    // stripping the flag on the way in) no longer exists to reproduce directly.
    await importJsonExportData(importDb, USER_ID, BOARD, parsedExportPayload({ ascents: [ascentRecord()] }));

    let rows = await ticksForUser();
    expect(rows).toHaveLength(1);
    expect(rows[0].is_mirror).toBe(false);
    const originalUuid = rows[0].uuid;
    const originalAuroraId = rows[0].aurora_id;

    // Re-import the SAME record, now carrying the flag. The dedup skips the
    // insert, so the heal UPDATE is the only thing that can correct the row.
    const reimport = await importJsonExportData(
      importDb,
      USER_ID,
      BOARD,
      parsedExportPayload({ ascents: [ascentRecord({ is_mirror: true })] }),
    );

    expect(reimport.ascents.imported).toBe(0);
    expect(reimport.ascents.skipped).toBe(1);

    rows = await ticksForUser();
    // Same row, healed — not a second tick, not a re-keyed one.
    expect(rows).toHaveLength(1);
    expect(rows[0].uuid).toBe(originalUuid);
    expect(rows[0].aurora_id).toBe(originalAuroraId);
    expect(rows[0].is_mirror).toBe(true);
  });

  it('does not overwrite a row the climber corrected by hand in Boardsesh', async () => {
    await importJsonExportData(
      importDb,
      USER_ID,
      BOARD,
      parsedExportPayload({ ascents: [ascentRecord({ is_mirror: true })] }),
    );

    // Simulate a local edit that turned mirror back off after the import: a
    // local edit is any row whose updated_at is newer than its last sync, the
    // same test the live Aurora pull uses.
    await db.execute(sql`
      UPDATE boardsesh_ticks
      SET is_mirror = false, updated_at = aurora_synced_at + interval '1 hour'
      WHERE user_id = ${USER_ID}
    `);

    await importJsonExportData(
      importDb,
      USER_ID,
      BOARD,
      parsedExportPayload({ ascents: [ascentRecord({ is_mirror: true })] }),
    );

    const rows = await ticksForUser();
    expect(rows).toHaveLength(1);
    expect(rows[0].is_mirror).toBe(false);
  });

  it('never rewrites the synthetic aurora_id when orientation changes', async () => {
    await importJsonExportData(importDb, USER_ID, BOARD, parsedExportPayload({ ascents: [ascentRecord()] }));
    const before = (await ticksForUser())[0].aurora_id;

    await importJsonExportData(
      importDb,
      USER_ID,
      BOARD,
      parsedExportPayload({ ascents: [ascentRecord({ is_mirror: true })] }),
    );
    const after = (await ticksForUser())[0].aurora_id;

    // The id is the ON CONFLICT arbiter for re-imports and the handle the live
    // Aurora pull claims placeholders by. Mirror is deliberately not part of it.
    expect(after).toBe(before);
  });
});
