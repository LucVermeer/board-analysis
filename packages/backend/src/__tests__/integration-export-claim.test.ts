// Real-database test for the export claim that serializes concurrent uploads.
// Its whole value is exercising Drizzle's `setWhere` on the conflict UPDATE
// against actual Postgres: if the installed Drizzle ever stopped applying the
// guard, the claim would silently overwrite 'success' rows with 'pending' and
// idempotency would break — exactly what the first assertion pins down.
import { describe, it, expect, beforeEach } from 'vite-plus/test';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/client';
import { integrationExports } from '@boardsesh/db/schema';
import { claimExport } from '../integrations/export-service';

// Seeded by the shared test setup.
const USER_ID = 'user-123';

function minutesAgo(minutes: number): Date {
  return new Date(Date.now() - minutes * 60 * 1000);
}

async function insertExportRow(sessionId: string, status: string, syncedAt: Date, externalActivityId: string | null) {
  await db.insert(integrationExports).values({
    provider: 'strava',
    userId: USER_ID,
    sessionType: 'party',
    sessionId,
    externalActivityId,
    status,
    error: status === 'error' ? 'previous failure' : null,
    syncedAt,
  });
}

async function readExportRow(sessionId: string) {
  const [row] = await db
    .select()
    .from(integrationExports)
    .where(and(eq(integrationExports.sessionId, sessionId), eq(integrationExports.userId, USER_ID)))
    .limit(1);
  return row ?? null;
}

describe('claimExport (real Postgres)', () => {
  beforeEach(async () => {
    await db.delete(integrationExports).where(eq(integrationExports.userId, USER_ID));
  });

  it('wins the claim when no export row exists, leaving a pending row', async () => {
    const result = await claimExport('strava', USER_ID, 'session-empty');
    expect(result.claimed).toBe(true);

    const row = await readExportRow('session-empty');
    expect(row?.status).toBe('pending');
  });

  it('loses against an existing success row WITHOUT overwriting it', async () => {
    await insertExportRow('session-done', 'success', minutesAgo(1), 'activity-42');

    const result = await claimExport('strava', USER_ID, 'session-done');

    expect(result.claimed).toBe(false);
    expect(result.blockingRow?.status).toBe('success');
    expect(result.blockingRow?.externalActivityId).toBe('activity-42');

    // The critical setWhere assertion: the conflict UPDATE must not have
    // touched the success row.
    const row = await readExportRow('session-done');
    expect(row?.status).toBe('success');
    expect(row?.externalActivityId).toBe('activity-42');
  });

  it('steals the claim from an error row (manual retry path)', async () => {
    await insertExportRow('session-failed', 'error', minutesAgo(1), null);

    const result = await claimExport('strava', USER_ID, 'session-failed');

    expect(result.claimed).toBe(true);
    const row = await readExportRow('session-failed');
    expect(row?.status).toBe('pending');
    expect(row?.error).toBeNull();
  });

  it('loses against a fresh pending claim (upload in flight elsewhere)', async () => {
    await insertExportRow('session-inflight', 'pending', minutesAgo(1), null);

    const result = await claimExport('strava', USER_ID, 'session-inflight');

    expect(result.claimed).toBe(false);
    expect(result.blockingRow?.status).toBe('pending');
  });

  it('takes over a stale pending claim (abandoned upload)', async () => {
    await insertExportRow('session-abandoned', 'pending', minutesAgo(11), null);

    const result = await claimExport('strava', USER_ID, 'session-abandoned');

    expect(result.claimed).toBe(true);
    const row = await readExportRow('session-abandoned');
    expect(row?.status).toBe('pending');
    // The claim refreshed syncedAt, so the new claim is no longer stale.
    expect(row && Date.now() - row.syncedAt.getTime() < 60 * 1000).toBe(true);
  });
});
