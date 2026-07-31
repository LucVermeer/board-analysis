// Exercises clearUserData against the REAL v1 DDL (via node:sqlite): every
// user-data table plus the mutation queue and sync checkpoints must be wiped on
// sign-out, while the expensive board reference cache is left untouched.
//
// Also guards the #3646 retirement: no bundled-seed machinery may come back into
// the DB lifecycle.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { SQLiteDatabase } from 'expo-sqlite';
import { clearUserData, initializeDatabase } from '../connection';
import {
  runMigrations,
  setCheckpoint,
  getCheckpoint,
  getCheckpointKey,
  enqueue,
  getPendingCount,
} from '@boardsesh/offline-sync';
import { createTestDatabase, type TestSqliteDb } from '@boardsesh/offline-sync/testing';

let db: TestSqliteDb & SQLiteDatabase;

async function countRows(table: string): Promise<number> {
  const row = await db.getFirstAsync<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table}`);
  return row?.count ?? 0;
}

beforeEach(async () => {
  // connection.ts is the expo lifecycle seam, so its API is typed against the
  // real SQLiteDatabase; the node adapter satisfies the used surface.
  db = createTestDatabase() as unknown as TestSqliteDb & SQLiteDatabase;
  await runMigrations(db);
});

describe('clearUserData', () => {
  it('clears every user-data table, the mutation queue, and sync checkpoints', async () => {
    const now = '2024-06-01T00:00:00Z';

    await db.runAsync(`INSERT INTO boardsesh_ticks (uuid, board_type, climb_uuid, angle) VALUES (?, ?, ?, ?)`, [
      'tick-1',
      'kilter',
      'climb-1',
      40,
    ]);
    await db.runAsync(`INSERT INTO playlists (uuid, name) VALUES (?, ?)`, ['pl-1', 'Projects']);
    await db.runAsync(`INSERT INTO playlist_climbs (playlist_uuid, climb_uuid) VALUES (?, ?)`, ['pl-1', 'climb-1']);
    await db.runAsync(`INSERT INTO user_favorites (board_name, climb_uuid, angle) VALUES (?, ?, ?)`, [
      'kilter',
      'climb-1',
      40,
    ]);
    await db.runAsync(`INSERT INTO user_follows (following_id) VALUES (?)`, ['user-2']);
    await db.runAsync(`INSERT INTO setter_follows (setter_username) VALUES (?)`, ['setter-x']);
    await db.runAsync(`INSERT INTO playlist_follows (playlist_uuid) VALUES (?)`, ['pl-9']);
    await enqueue(db, 'boardsesh_ticks', 'create', { climbUuid: 'climb-1' }, 'tick-1');
    await setCheckpoint(db, getCheckpointKey('boardsesh_ticks'), { updatedAt: now, syncSeq: '5' });

    // Board reference data that must survive the wipe.
    await db.runAsync(`INSERT INTO board_climbs (uuid, board_type) VALUES (?, ?)`, ['climb-1', 'kilter']);
    await db.runAsync(
      `INSERT INTO board_climb_stats (board_type, climb_uuid, angle, ascensionist_count) VALUES (?, ?, ?, ?)`,
      ['kilter', 'climb-1', 40, 12],
    );

    await clearUserData(db);

    expect(await countRows('boardsesh_ticks')).toBe(0);
    expect(await countRows('playlists')).toBe(0);
    expect(await countRows('playlist_climbs')).toBe(0);
    expect(await countRows('user_favorites')).toBe(0);
    expect(await countRows('user_follows')).toBe(0);
    expect(await countRows('setter_follows')).toBe(0);
    expect(await countRows('playlist_follows')).toBe(0);
    expect(await getPendingCount(db)).toBe(0);
    expect(await getCheckpoint(db, getCheckpointKey('boardsesh_ticks'))).toBeNull();

    // The expensive shared cache is deliberately retained.
    expect(await countRows('board_climbs')).toBe(1);
    expect(await countRows('board_climb_stats')).toBe(1);
  });

  it('is a no-op on an already-empty database', async () => {
    await clearUserData(db);

    expect(await countRows('boardsesh_ticks')).toBe(0);
    expect(await getPendingCount(db)).toBe(0);
  });
});

// #3646 retired the bundled seed-database import (ATTACH + row copy + cursor
// stamping) from initializeDatabase. A behavioural test cannot guard that: the
// seam always resolved to "no asset" in every shipped build, so restoring the code
// changes nothing observable at runtime. The assertion that does bite on revert is
// a source-level one — the seam file is gone and the lifecycle module mentions no
// seed at all.
describe('bundled seed retirement (#3646)', () => {
  const dbModuleDir = fileURLToPath(new URL('../', import.meta.url));

  it('keeps the seed seam module deleted', () => {
    expect(existsSync(join(dbModuleDir, 'seed-asset.ts'))).toBe(false);
  });

  it('leaves no seed machinery in the database lifecycle', () => {
    const lifecycleSource = readFileSync(join(dbModuleDir, 'connection.ts'), 'utf8');
    // Every name the retired path needed. Restoring any part of it trips one.
    expect(lifecycleSource).not.toMatch(
      /resolveSeedAssetModuleId|loadOptionalSeed|SEEDABLE_BOARD_TABLES|seed_checkpoints|ATTACH DATABASE|expo-asset/,
    );
  });
});

// WAL persists on the file header (so it can't be checked on an in-memory DB —
// PRAGMA journal_mode = WAL returns "memory" there), so these run file-backed.
describe('initializeDatabase connection PRAGMAs', () => {
  let dbDir: string;
  let fileDb: TestSqliteDb & SQLiteDatabase;
  let dbPath: string;

  beforeEach(() => {
    dbDir = mkdtempSync(join(tmpdir(), 'bs-conn-'));
    dbPath = join(dbDir, 'boardsesh.db');
    fileDb = createTestDatabase(dbPath) as unknown as TestSqliteDb & SQLiteDatabase;
  });

  afterEach(() => {
    rmSync(dbDir, { recursive: true, force: true });
  });

  it('puts the main connection in WAL mode with a 5s busy_timeout', async () => {
    await initializeDatabase(fileDb);

    const journal = await fileDb.getFirstAsync<{ journal_mode: string }>('PRAGMA journal_mode');
    expect(journal?.journal_mode?.toLowerCase()).toBe('wal');
    const busy = await fileDb.getFirstAsync<{ timeout: number }>('PRAGMA busy_timeout');
    expect(busy?.timeout).toBe(5000);
  });

  it('persists WAL on the file so a fresh connection inherits it', async () => {
    await initializeDatabase(fileDb);

    // A separately-opened connection (mirrors the per-task connection
    // withExclusiveTransactionAsync spins up) reads WAL from the file header,
    // but starts with the default busy_timeout of 0 — hence the per-connection set.
    const other = createTestDatabase(dbPath) as unknown as TestSqliteDb & SQLiteDatabase;
    const journal = await other.getFirstAsync<{ journal_mode: string }>('PRAGMA journal_mode');
    expect(journal?.journal_mode?.toLowerCase()).toBe('wal');
    const busy = await other.getFirstAsync<{ timeout: number }>('PRAGMA busy_timeout');
    expect(busy?.timeout).toBe(0);
  });
});
