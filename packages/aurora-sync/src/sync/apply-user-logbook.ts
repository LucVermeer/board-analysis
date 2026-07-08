import { randomUUID } from 'crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';

import { boardseshTicks } from '@boardsesh/db/schema';
import {
  recomputeClimbStatsBulk,
  inferUserUtcOffsetSeconds,
  climbedAtMatchesForAdoption,
  MAX_USER_UTC_OFFSET_SECONDS,
  NATURAL_KEY_TOLERANCE_SECONDS,
  type ClimbStatsKey,
  type TickTimeSample,
} from '@boardsesh/db/queries';
import { convertQuality } from '@boardsesh/shared-schema';
import type { AuroraBoardName } from '@boardsesh/shared-schema/types';

import { normalizeTimestamp } from './normalize-timestamp';

/**
 * Shared apply logic for the Aurora live pull (ascents + bids), used by BOTH
 * the daemon path (packages/aurora-sync/src/sync/user-sync.ts) and the web
 * cron path (packages/web/app/lib/data-sync/aurora/user-sync.ts) so the
 * timezone-correctness, cross-source claim, soft-delete and edit-clobber
 * behaviour lives in one place.
 *
 * The three behaviours PR4 adds over the previous naive `INSERT … ON CONFLICT
 * (aurora_id)` upsert:
 *
 *  1. Timezone-correct timestamps (§work-item 1). Aurora's naive
 *     "YYYY-MM-DD HH:MM:SS" is UTC; the old `new Date(...).toISOString()`
 *     parsed it as server-local time and shifted every pulled tick by the
 *     deployment's UTC offset. `normalizeTimestamp` pins it to UTC — and makes
 *     the pulled climbed_at IDENTICAL to what the JSON import wrote for the same
 *     ascent, which is what the claim below keys on.
 *
 *  2. Cross-source claim (§work-item 3). On an aurora_id miss, before inserting
 *     a twin, natural-key-match the incoming ascent against the user's existing
 *     json_import / native rows (widened window + per-user offset inference for
 *     pre-fix, timezone-shifted history) and CLAIM the row — stamp
 *     aurora_id/aurora_type/aurora_synced_at, keep origin (origin records FIRST
 *     creation). No twin inserted.
 *
 *  3. Soft-delete honouring (§work-item 5, ascents only). Aurora sets
 *     is_listed=false to tombstone a deleted logbook entry. We stop upserting it
 *     as a live tick: a pull-owned row (origin aurora_pull/kilter_pull) is
 *     deleted; a CLAIMED native/json_import row just has its aurora markers
 *     cleared and the tick is kept (the user still owns it in Boardsesh).
 *
 *  4. Edit-clobber guard (§work-item 7). A by-aurora-id re-sync only overwrites
 *     a row that hasn't been locally edited since the last sync
 *     (updated_at ≤ aurora_synced_at) AND whose payload actually changed — no
 *     pointless writes/trigger churn, no clobbering a local edit.
 *
 * Operates on the caller's transaction handle — does not open its own.
 */

type DrizzleDb = PgDatabase<PgQueryResultHKT, Record<string, unknown>>;

// Any drizzle DB/transaction handle satisfies the query surface we use; the
// web (Neon HTTP) client and the daemon (postgres-js) client both qualify.
type AuroraApiRow = Record<string, unknown>;

const WRITE_CHUNK_SIZE = 100;

type NormalizedLogbookRow = {
  auroraId: string;
  climbUuid: string;
  angle: number;
  isMirror: boolean;
  status: 'flash' | 'send' | 'attempt';
  attemptCount: number;
  quality: number | null;
  difficulty: number | null;
  isBenchmark: boolean;
  comment: string;
  climbedAt: string;
  createdAt: string;
  auroraType: 'ascents' | 'bids';
};

/** Compared columns that decide whether a by-aurora-id re-sync is a real change. */
type ComparedRow = {
  uuid: string;
  auroraId: string | null;
  climbUuid: string;
  angle: number;
  isMirror: boolean | null;
  status: string;
  attemptCount: number;
  quality: number | null;
  difficulty: number | null;
  isBenchmark: boolean | null;
  comment: string | null;
  climbedAt: string;
  updatedAt: string;
  auroraSyncedAt: string | null;
  origin: string;
};

/** Aurora encodes is_listed across a few wire shapes; only tombstone on explicit false. */
function isAuroraListedFalse(value: unknown): boolean {
  return value === false || value === 0 || value === '0' || value === 'false';
}

function toBool(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'true';
}

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeAscent(item: AuroraApiRow): NormalizedLogbookRow {
  return {
    auroraId: String(item.uuid),
    climbUuid: String(item.climb_uuid),
    angle: Number(item.angle),
    isMirror: toBool(item.is_mirror),
    status: Number(item.attempt_id) === 1 ? 'flash' : 'send',
    attemptCount: Number(item.bid_count || 1),
    quality: convertQuality(item.quality != null && item.quality !== '' ? Number(item.quality) : null),
    difficulty: toNumberOrNull(item.difficulty),
    isBenchmark: toBool(item.is_benchmark),
    comment: item.comment ? String(item.comment) : '',
    climbedAt: normalizeTimestamp(String(item.climbed_at)),
    createdAt: item.created_at
      ? normalizeTimestamp(String(item.created_at))
      : normalizeTimestamp(String(item.climbed_at)),
    auroraType: 'ascents',
  };
}

function normalizeBid(item: AuroraApiRow): NormalizedLogbookRow {
  return {
    auroraId: String(item.uuid),
    climbUuid: String(item.climb_uuid),
    angle: Number(item.angle),
    isMirror: toBool(item.is_mirror),
    status: 'attempt',
    attemptCount: Number(item.bid_count || 1),
    quality: null,
    difficulty: null,
    isBenchmark: false,
    comment: item.comment ? String(item.comment) : '',
    climbedAt: normalizeTimestamp(String(item.climbed_at)),
    createdAt: item.created_at
      ? normalizeTimestamp(String(item.created_at))
      : normalizeTimestamp(String(item.climbed_at)),
    auroraType: 'bids',
  };
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Honour Aurora ascent tombstones (is_listed=false): a pull-owned row is
 * deleted; a claimed native/json_import row keeps the tick and just drops its
 * aurora markers. Returns the (climb, angle) keys touched.
 */
async function applyAuroraTombstones(
  db: DrizzleDb,
  boardName: AuroraBoardName,
  userId: string,
  auroraIds: string[],
): Promise<ClimbStatsKey[]> {
  const touched: ClimbStatsKey[] = [];
  if (auroraIds.length === 0) return touched;

  for (const ids of chunk(auroraIds, WRITE_CHUNK_SIZE)) {
    const rows = await db
      .select({
        uuid: boardseshTicks.uuid,
        climbUuid: boardseshTicks.climbUuid,
        angle: boardseshTicks.angle,
        origin: boardseshTicks.origin,
      })
      .from(boardseshTicks)
      .where(
        and(
          eq(boardseshTicks.userId, userId),
          eq(boardseshTicks.boardType, boardName),
          inArray(boardseshTicks.auroraId, ids),
        ),
      );

    const toDelete: string[] = [];
    const toClear: string[] = [];
    for (const row of rows) {
      touched.push({ boardType: boardName, climbUuid: row.climbUuid, angle: row.angle });
      // A claimed native/json_import row is owned by Boardsesh (or the JSON
      // export) — keep the tick, just unlink it from the now-deleted Aurora
      // ascent. A pull-owned row is upstream's; the tombstone means delete.
      if (row.origin === 'native' || row.origin === 'json_import') toClear.push(row.uuid);
      else toDelete.push(row.uuid);
    }

    if (toDelete.length > 0) {
      await db.delete(boardseshTicks).where(inArray(boardseshTicks.uuid, toDelete));
    }
    if (toClear.length > 0) {
      await db
        .update(boardseshTicks)
        .set({
          auroraId: null,
          auroraType: null,
          auroraSyncedAt: null,
          auroraSyncError: null,
          updatedAt: new Date().toISOString(),
        })
        .where(inArray(boardseshTicks.uuid, toClear));
    }
  }
  return touched;
}

function payloadDiffersFromStored(incoming: NormalizedLogbookRow, stored: ComparedRow): boolean {
  return (
    incoming.climbUuid !== stored.climbUuid ||
    incoming.angle !== stored.angle ||
    incoming.isMirror !== (stored.isMirror ?? false) ||
    incoming.status !== stored.status ||
    incoming.attemptCount !== stored.attemptCount ||
    incoming.quality !== stored.quality ||
    incoming.difficulty !== stored.difficulty ||
    incoming.isBenchmark !== (stored.isBenchmark ?? false) ||
    incoming.comment !== (stored.comment ?? '') ||
    Date.parse(incoming.climbedAt) !== Date.parse(stored.climbedAt)
  );
}

/** True when the row carries a local edit newer than the last successful sync. */
function isLocallyEdited(stored: ComparedRow): boolean {
  if (stored.auroraSyncedAt === null) return false; // never synced from Aurora → pull is authoritative
  return Date.parse(stored.updatedAt) > Date.parse(stored.auroraSyncedAt);
}

async function applyLogbookChunk(
  db: DrizzleDb,
  boardName: AuroraBoardName,
  userId: string,
  incoming: NormalizedLogbookRow[],
  now: string,
  auroraType: 'ascents' | 'bids',
  claimStatuses: Array<'flash' | 'send' | 'attempt'>,
): Promise<ClimbStatsKey[]> {
  const touched: ClimbStatsKey[] = [];
  const addKey = (climbUuid: string, angle: number) => touched.push({ boardType: boardName, climbUuid, angle });

  const incomingIds = incoming.map((r) => r.auroraId);

  // (a) Existing rows by aurora_id (the idempotent re-sync case).
  const byAuroraIdRows = (await db
    .select({
      uuid: boardseshTicks.uuid,
      auroraId: boardseshTicks.auroraId,
      climbUuid: boardseshTicks.climbUuid,
      angle: boardseshTicks.angle,
      isMirror: boardseshTicks.isMirror,
      status: boardseshTicks.status,
      attemptCount: boardseshTicks.attemptCount,
      quality: boardseshTicks.quality,
      difficulty: boardseshTicks.difficulty,
      isBenchmark: boardseshTicks.isBenchmark,
      comment: boardseshTicks.comment,
      climbedAt: boardseshTicks.climbedAt,
      updatedAt: boardseshTicks.updatedAt,
      auroraSyncedAt: boardseshTicks.auroraSyncedAt,
      origin: boardseshTicks.origin,
    })
    .from(boardseshTicks)
    .where(inArray(boardseshTicks.auroraId, incomingIds))) as ComparedRow[];

  const storedByAuroraId = new Map<string, ComparedRow>();
  for (const row of byAuroraIdRows) {
    if (row.auroraId) storedByAuroraId.set(row.auroraId, row);
  }

  const misses = incoming.filter((r) => !storedByAuroraId.has(r.auroraId));

  // (b) Cross-source claim for the misses.
  const claims = new Map<string, string>(); // aurora_id → existing tick uuid to claim
  const claimedUuids = new Set<string>();
  if (misses.length > 0) {
    const climbSet = Array.from(new Set(misses.map((m) => m.climbUuid)));
    const angleSet = Array.from(new Set(misses.map((m) => m.angle)));
    const timestamps = misses.map((m) => Date.parse(m.climbedAt)).filter((t) => Number.isFinite(t));
    if (timestamps.length > 0) {
      // Widen the fetch window by the max plausible offset so a pre-fix,
      // timezone-shifted original is inside the range and can be claimed.
      const windowMs = (MAX_USER_UTC_OFFSET_SECONDS + NATURAL_KEY_TOLERANCE_SECONDS) * 1000;
      const minTs = new Date(Math.min(...timestamps) - windowMs).toISOString();
      const maxTs = new Date(Math.max(...timestamps) + windowMs).toISOString();

      const candidateRows = await db
        .select({
          uuid: boardseshTicks.uuid,
          climbUuid: boardseshTicks.climbUuid,
          angle: boardseshTicks.angle,
          climbedAt: boardseshTicks.climbedAt,
          status: boardseshTicks.status,
        })
        .from(boardseshTicks)
        .where(
          and(
            eq(boardseshTicks.userId, userId),
            eq(boardseshTicks.boardType, boardName),
            inArray(boardseshTicks.climbUuid, climbSet),
            inArray(boardseshTicks.angle, angleSet),
            inArray(boardseshTicks.origin, ['native', 'json_import']),
            inArray(boardseshTicks.status, claimStatuses),
            sql`${boardseshTicks.climbedAt}::timestamptz BETWEEN ${minTs}::timestamptz AND ${maxTs}::timestamptz`,
          ),
        );

      const existingSamples: TickTimeSample[] = candidateRows.map((r) => ({
        climbUuid: r.climbUuid,
        angle: r.angle,
        climbedAtMs: Date.parse(r.climbedAt),
      }));
      const incomingSamples: TickTimeSample[] = misses.map((m) => ({
        climbUuid: m.climbUuid,
        angle: m.angle,
        climbedAtMs: Date.parse(m.climbedAt),
      }));
      const offset = inferUserUtcOffsetSeconds(existingSamples, incomingSamples);

      for (const miss of misses) {
        const missMs = Date.parse(miss.climbedAt);
        if (!Number.isFinite(missMs)) continue;
        const match = candidateRows.find(
          (r) =>
            !claimedUuids.has(r.uuid) &&
            r.climbUuid === miss.climbUuid &&
            r.angle === miss.angle &&
            climbedAtMatchesForAdoption(Date.parse(r.climbedAt), missMs, offset),
        );
        if (match) {
          claims.set(miss.auroraId, match.uuid);
          claimedUuids.add(match.uuid);
          addKey(miss.climbUuid, miss.angle);
        }
      }
    }
  }

  // (c) By-aurora-id updates: skip locally-edited rows and no-op re-syncs.
  const updates = incoming
    .map((row) => ({ row, stored: storedByAuroraId.get(row.auroraId) }))
    .filter(
      (u): u is { row: NormalizedLogbookRow; stored: ComparedRow } =>
        u.stored !== undefined && !isLocallyEdited(u.stored) && payloadDiffersFromStored(u.row, u.stored),
    );

  // (d) Inserts: misses that weren't claimed.
  const inserts = misses.filter((m) => !claims.has(m.auroraId));

  // --- Writes ---
  if (claims.size > 0) {
    const claimPayload = JSON.stringify(
      [...claims.entries()].map(([auroraId, uuid]) => ({ uuid, aurora_id: auroraId })),
    );
    await db.execute(sql`
      UPDATE boardsesh_ticks AS t SET
        aurora_id = u.aurora_id,
        aurora_type = ${auroraType}::aurora_table_type,
        aurora_synced_at = ${now}::timestamp,
        aurora_sync_error = NULL
      -- No updated_at: a claim only stamps sync-tracking columns (all
      -- whitelisted by trg_boardsesh_ticks_set_updated_at), so the tick's
      -- content is unchanged and it must not re-ship to offline clients. This
      -- also keeps updated_at < aurora_synced_at so the edit-clobber guard
      -- correctly reads the row as NOT locally edited.
      FROM jsonb_to_recordset(${claimPayload}::jsonb) AS u(uuid text, aurora_id text)
      WHERE t.uuid = u.uuid
    `);
  }

  if (updates.length > 0) {
    for (const { row, stored } of updates) {
      // A re-sync can move a log to a different climb/angle; recompute both.
      addKey(stored.climbUuid, stored.angle);
      addKey(row.climbUuid, row.angle);
    }
    const updatePayload = JSON.stringify(
      updates.map(({ row }) => ({
        aurora_id: row.auroraId,
        climb_uuid: row.climbUuid,
        angle: row.angle,
        is_mirror: row.isMirror,
        status: row.status,
        attempt_count: row.attemptCount,
        quality: row.quality,
        difficulty: row.difficulty,
        is_benchmark: row.isBenchmark,
        comment: row.comment,
        climbed_at: row.climbedAt,
        aurora_synced_at: now,
        updated_at: now,
      })),
    );
    await db.execute(sql`
      UPDATE boardsesh_ticks AS t SET
        climb_uuid = u.climb_uuid,
        angle = u.angle,
        is_mirror = u.is_mirror,
        status = u.status::tick_status,
        attempt_count = u.attempt_count,
        quality = u.quality,
        difficulty = u.difficulty,
        is_benchmark = u.is_benchmark,
        comment = u.comment,
        climbed_at = u.climbed_at::timestamp,
        aurora_synced_at = u.aurora_synced_at::timestamp,
        aurora_sync_error = NULL,
        updated_at = u.updated_at::timestamp
      FROM jsonb_to_recordset(${updatePayload}::jsonb) AS u(
        aurora_id text,
        climb_uuid text,
        angle integer,
        is_mirror boolean,
        status text,
        attempt_count integer,
        quality integer,
        difficulty integer,
        is_benchmark boolean,
        comment text,
        climbed_at text,
        aurora_synced_at text,
        updated_at text
      )
      WHERE t.aurora_id = u.aurora_id
    `);
  }

  if (inserts.length > 0) {
    await db.insert(boardseshTicks).values(
      inserts.map((row) => {
        addKey(row.climbUuid, row.angle);
        return {
          uuid: randomUUID(),
          userId,
          boardType: boardName,
          climbUuid: row.climbUuid,
          angle: row.angle,
          isMirror: row.isMirror,
          // Freshly pulled from the user's Aurora logbook — already inside
          // upstream_ascensionist_count, so origin excludes it from the
          // Boardsesh double-count guard.
          origin: 'aurora_pull' as const,
          status: row.status,
          attemptCount: row.attemptCount,
          quality: row.quality,
          difficulty: row.difficulty,
          isBenchmark: row.isBenchmark,
          comment: row.comment,
          climbedAt: row.climbedAt,
          createdAt: row.createdAt,
          updatedAt: now,
          auroraType: row.auroraType,
          auroraId: row.auroraId,
          auroraSyncedAt: now,
        };
      }),
    );
  }

  return touched;
}

/**
 * Apply a full ascents payload: honour tombstones, then claim/update/insert the
 * live rows in write-sized chunks, then recompute every touched (climb, angle).
 */
export async function applyAuroraAscents(
  db: DrizzleDb,
  boardName: AuroraBoardName,
  userId: string,
  data: AuroraApiRow[],
): Promise<void> {
  if (data.length === 0) return;
  const now = new Date().toISOString();
  const touchedKeys: ClimbStatsKey[] = [];

  const tombstoneIds: string[] = [];
  const live: NormalizedLogbookRow[] = [];
  for (const item of data) {
    if (isAuroraListedFalse(item.is_listed)) {
      tombstoneIds.push(String(item.uuid));
    } else {
      live.push(normalizeAscent(item));
    }
  }

  touchedKeys.push(...(await applyAuroraTombstones(db, boardName, userId, tombstoneIds)));

  for (const batch of chunk(live, WRITE_CHUNK_SIZE)) {
    touchedKeys.push(...(await applyLogbookChunk(db, boardName, userId, batch, now, 'ascents', ['flash', 'send'])));
  }

  await recomputeClimbStatsBulk(db, touchedKeys);
}

/** Apply a full bids payload: claim/update/insert attempts (no tombstones). */
export async function applyAuroraBids(
  db: DrizzleDb,
  boardName: AuroraBoardName,
  userId: string,
  data: AuroraApiRow[],
): Promise<void> {
  if (data.length === 0) return;
  const now = new Date().toISOString();
  const touchedKeys: ClimbStatsKey[] = [];

  const live = data.map(normalizeBid);
  for (const batch of chunk(live, WRITE_CHUNK_SIZE)) {
    touchedKeys.push(...(await applyLogbookChunk(db, boardName, userId, batch, now, 'bids', ['attempt'])));
  }

  await recomputeClimbStatsBulk(db, touchedKeys);
}
