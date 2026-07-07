import { lt } from 'drizzle-orm';
import { syncDeletions } from '@boardsesh/db/schema';
import { db, type Database } from '../db/client';

/**
 * Retention window for sync-deletion tombstones. Mirrors the schema doc on
 * `sync_deletions` (packages/db/src/schema/app/sync-deletions.ts): tombstones
 * older than this are pruned by the daily job in server.ts.
 *
 * A client whose deletions checkpoint is older than this window can miss
 * pruned tombstones (stale local rows until the affected records are next
 * upserted). Detecting that gap and forcing a from-scratch resync is a
 * client-side follow-up; the unbounded-growth risk of never pruning is the
 * worse trade.
 */
export const SYNC_DELETIONS_RETENTION_DAYS = 90;

export async function pruneSyncDeletions(database: Database = db): Promise<number> {
  const cutoff = new Date(Date.now() - SYNC_DELETIONS_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  // postgres.js RowList: `count` is the affected-row count for DELETE.
  const result = await database.delete(syncDeletions).where(lt(syncDeletions.deletedAt, cutoff));
  return result.count ?? 0;
}
