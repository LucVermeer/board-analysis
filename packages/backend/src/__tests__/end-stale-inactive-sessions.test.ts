import { describe, it, expect } from 'vite-plus/test';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/client';
import { sessions } from '../db/schema';
import { eq } from 'drizzle-orm';
import { endStaleInactiveSessions } from '../services/room-manager/session-discovery';

const ONE_HOUR_MS = 60 * 60 * 1000;

function minutesAgo(minutes: number): Date {
  return new Date(Date.now() - minutes * 60 * 1000);
}

describe('endStaleInactiveSessions', () => {
  it('ends active, non-permanent sessions whose lastActivity is older than the threshold', async () => {
    const sessionId = uuidv4();
    await db.insert(sessions).values({
      id: sessionId,
      boardPath: '/kilter/1/2/3/40',
      status: 'active',
      isPermanent: false,
      lastActivity: minutesAgo(90),
    });

    const ended = await endStaleInactiveSessions(ONE_HOUR_MS);
    expect(ended).toBe(1);

    const [row] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
    expect(row?.status).toBe('ended');
    expect(row?.endedAt).not.toBeNull();
    expect(row?.lastActivity.getTime()).toBeGreaterThan(minutesAgo(1).getTime());
  });

  it('leaves permanent sessions untouched regardless of lastActivity', async () => {
    const sessionId = uuidv4();
    await db.insert(sessions).values({
      id: sessionId,
      boardPath: '/kilter/1/2/3/40',
      status: 'active',
      isPermanent: true,
      lastActivity: minutesAgo(120),
    });

    const ended = await endStaleInactiveSessions(ONE_HOUR_MS);
    expect(ended).toBe(0);

    const [row] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
    expect(row?.status).toBe('active');
    expect(row?.endedAt).toBeNull();
  });

  it('leaves recently-active sessions untouched', async () => {
    const sessionId = uuidv4();
    await db.insert(sessions).values({
      id: sessionId,
      boardPath: '/kilter/1/2/3/40',
      status: 'active',
      isPermanent: false,
      lastActivity: minutesAgo(10),
    });

    const ended = await endStaleInactiveSessions(ONE_HOUR_MS);
    expect(ended).toBe(0);

    const [row] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
    expect(row?.status).toBe('active');
    expect(row?.endedAt).toBeNull();
  });

  it('leaves already-ended sessions untouched (status filter)', async () => {
    const sessionId = uuidv4();
    const originalEndedAt = minutesAgo(90);
    await db.insert(sessions).values({
      id: sessionId,
      boardPath: '/kilter/1/2/3/40',
      status: 'ended',
      isPermanent: false,
      lastActivity: minutesAgo(120),
      endedAt: originalEndedAt,
    });

    const ended = await endStaleInactiveSessions(ONE_HOUR_MS);
    expect(ended).toBe(0);

    const [row] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
    expect(row?.status).toBe('ended');
    expect(row?.endedAt?.getTime()).toBe(originalEndedAt.getTime());
  });

  it('returns the affected row count across a mixed batch', async () => {
    const stale1 = uuidv4();
    const stale2 = uuidv4();
    const fresh = uuidv4();
    const permanent = uuidv4();

    await db.insert(sessions).values([
      { id: stale1, boardPath: '/kilter/1/2/3/40', status: 'active', isPermanent: false, lastActivity: minutesAgo(90) },
      { id: stale2, boardPath: '/kilter/1/2/3/40', status: 'active', isPermanent: false, lastActivity: minutesAgo(75) },
      { id: fresh, boardPath: '/kilter/1/2/3/40', status: 'active', isPermanent: false, lastActivity: minutesAgo(10) },
      {
        id: permanent,
        boardPath: '/kilter/1/2/3/40',
        status: 'active',
        isPermanent: true,
        lastActivity: minutesAgo(180),
      },
    ]);

    const ended = await endStaleInactiveSessions(ONE_HOUR_MS);
    expect(ended).toBe(2);

    const rows = await db.select().from(sessions);
    const byId = new Map(rows.map((r) => [r.id, r.status]));
    expect(byId.get(stale1)).toBe('ended');
    expect(byId.get(stale2)).toBe('ended');
    expect(byId.get(fresh)).toBe('active');
    expect(byId.get(permanent)).toBe('active');
  });
});
