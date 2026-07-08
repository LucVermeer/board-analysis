import { beforeEach, describe, expect, it } from 'vite-plus/test';
import { sql } from 'drizzle-orm';
import { v5 as uuidv5 } from 'uuid';
import type { MoonBoardExportLogRow, StrippedMoonBoardExportData } from '@boardsesh/shared-schema';
import { db } from '../db/client';
import { importMoonBoardExportData } from '../services/moonboard-import';

const TEST_USER_ID = 'moonboard-import-test-user';
const UUID_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
const SIX_A_PLUS_DIFFICULTY_ID = 17;
const SIX_B_DIFFICULTY_ID = 18;

const describeWithDatabase = process.env.SKIP_TEST_INFRA === '1' ? describe.skip : describe;

type ImportedTickRow = {
  climb_uuid: string;
  status: string;
  attempt_count: number | string;
  climbed_on: string;
};

function moonBoardCandidateUuid(problemId: number): string {
  return uuidv5(`moonboard:${problemId}`, UUID_NAMESPACE);
}

function moonBoardLogRow(input: {
  lineNumber: number;
  problemId: number;
  grade?: string;
  tries: string;
  attempts?: number;
  rating?: number | null;
  date?: string;
}): MoonBoardExportLogRow {
  return {
    lineNumber: input.lineNumber,
    problemId: input.problemId,
    grade: input.grade ?? '6A+',
    tries: input.tries,
    attempts: input.attempts ?? 0,
    rating: 'rating' in input ? (input.rating ?? null) : 4,
    date: input.date ?? '13/02/26',
  };
}

function moonBoardImportData(logs: MoonBoardExportLogRow[]): StrippedMoonBoardExportData {
  return {
    user: { username: 'moonboard-import-test' },
    logs,
  };
}

async function insertMoonBoardClimb(input: {
  problemId: number;
  difficultyId?: number;
  canonicalUuid?: string;
}): Promise<string> {
  const climbUuid = input.canonicalUuid ?? moonBoardCandidateUuid(input.problemId);
  await db.execute(sql`
    INSERT INTO board_climbs (uuid, board_type, layout_id, name, angle)
    VALUES (${climbUuid}, 'moonboard', 2, ${'MoonBoard import fixture ' + input.problemId}, 40)
  `);
  await db.execute(sql`
    INSERT INTO board_climb_stats (board_type, climb_uuid, angle, display_difficulty)
    VALUES ('moonboard', ${climbUuid}, 40, ${input.difficultyId ?? SIX_A_PLUS_DIFFICULTY_ID})
  `);
  return climbUuid;
}

async function insertMoonBoardAlias(problemId: number, canonicalUuid: string): Promise<void> {
  await db.execute(sql`
    INSERT INTO board_climb_aliases (board_type, alias_uuid, canonical_uuid, source)
    VALUES ('moonboard', ${moonBoardCandidateUuid(problemId)}, ${canonicalUuid}, 'moonboard-import-test')
  `);
}

async function importedTicks(): Promise<ImportedTickRow[]> {
  return (await db.execute(sql`
    SELECT
      climb_uuid,
      status,
      attempt_count,
      to_char(climbed_at::date, 'YYYY-MM-DD') AS climbed_on
    FROM boardsesh_ticks
    WHERE user_id = ${TEST_USER_ID}
    ORDER BY climbed_at, status, attempt_count
  `)) as unknown as ImportedTickRow[];
}

describeWithDatabase('importMoonBoardExportData', () => {
  beforeEach(async () => {
    await db.execute(sql`
      TRUNCATE TABLE boardsesh_ticks, board_climb_aliases, board_climb_stats, board_climbs, users
      RESTART IDENTITY CASCADE
    `);
    await db.execute(sql`
      INSERT INTO users (id, email, name, created_at, updated_at)
      VALUES (${TEST_USER_ID}, 'moonboard-import@test.boardsesh.com', 'MoonBoard Import Test', now(), now())
    `);
  });

  it('skips existing MoonBoard ticks on the same calendar day even when the time differs', async () => {
    const climbUuid = await insertMoonBoardClimb({ problemId: 101 });
    await db.execute(sql`
      INSERT INTO boardsesh_ticks (
        uuid,
        user_id,
        board_type,
        climb_uuid,
        angle,
        origin,
        status,
        attempt_count,
        quality,
        difficulty,
        climbed_at
      )
      VALUES (
        'moonboard-import-existing-same-day',
        ${TEST_USER_ID},
        'moonboard',
        ${climbUuid},
        40,
        'native',
        'send',
        2,
        4,
        ${SIX_A_PLUS_DIFFICULTY_ID},
        '2026-02-13 09:06:00'
      )
    `);

    const result = await importMoonBoardExportData(
      db,
      TEST_USER_ID,
      moonBoardImportData([moonBoardLogRow({ lineNumber: 1, problemId: 101, tries: 'Flashed' })]),
      () => {},
    );

    expect(result.ticks).toEqual({ imported: 0, skipped: 1, failed: 0 });
    expect(await importedTicks()).toHaveLength(1);
  });

  it('imports distinct project and send rows for the same climb on the same CSV date', async () => {
    const climbUuid = await insertMoonBoardClimb({ problemId: 102 });

    const result = await importMoonBoardExportData(
      db,
      TEST_USER_ID,
      moonBoardImportData([
        moonBoardLogRow({ lineNumber: 1, problemId: 102, tries: 'Project', attempts: 3, rating: null }),
        moonBoardLogRow({ lineNumber: 2, problemId: 102, tries: 'Flashed' }),
      ]),
      () => {},
    );

    expect(result.ticks).toEqual({ imported: 2, skipped: 0, failed: 0 });
    expect(result.ascents).toEqual({ imported: 1, skipped: 0, failed: 0 });
    expect(result.attempts).toEqual({ imported: 1, skipped: 0, failed: 0 });
    expect(await importedTicks()).toEqual([
      { climb_uuid: climbUuid, status: 'flash', attempt_count: 1, climbed_on: '2026-02-13' },
      { climb_uuid: climbUuid, status: 'attempt', attempt_count: 3, climbed_on: '2026-02-13' },
    ]);
  });

  it('resolves aliases to canonical climbs and rejects grade mismatches', async () => {
    const canonicalUuid = 'moonboard-import-canonical-103';
    await insertMoonBoardClimb({
      problemId: 103,
      canonicalUuid,
      difficultyId: SIX_A_PLUS_DIFFICULTY_ID,
    });
    await insertMoonBoardAlias(103, canonicalUuid);
    await insertMoonBoardClimb({ problemId: 104, difficultyId: SIX_B_DIFFICULTY_ID });

    const result = await importMoonBoardExportData(
      db,
      TEST_USER_ID,
      moonBoardImportData([
        moonBoardLogRow({ lineNumber: 1, problemId: 103, tries: 'Flashed' }),
        moonBoardLogRow({ lineNumber: 2, problemId: 104, tries: 'Flashed' }),
      ]),
      () => {},
    );

    expect(result.ticks).toEqual({ imported: 1, skipped: 0, failed: 1 });
    expect(result.ascents).toEqual({ imported: 1, skipped: 0, failed: 1 });
    expect(result.unresolvedClimbs).toEqual(['104']);
    expect(await importedTicks()).toEqual([
      { climb_uuid: canonicalUuid, status: 'flash', attempt_count: 1, climbed_on: '2026-02-13' },
    ]);
  });
});
