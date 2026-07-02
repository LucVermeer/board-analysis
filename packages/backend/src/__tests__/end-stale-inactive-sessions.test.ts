import { describe, it, expect, vi } from 'vite-plus/test';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/client';
import { sessions } from '../db/schema';
import { eq, inArray } from 'drizzle-orm';
import { endStaleInactiveSessions } from '../services/room-manager/session-discovery';
import { roomManager } from '../services/room-manager';
import { pubsub } from '../pubsub/index';

const ONE_HOUR_MS = 60 * 60 * 1000;

function minutesAgo(minutes: number): Date {
  return new Date(Date.now() - minutes * 60 * 1000);
}

describe('endStaleInactiveSessions', () => {
  it('ends active, non-permanent sessions whose lastActivity is older than the threshold', async () => {
    const sessionId = uuidv4();
    const lastActivity = minutesAgo(90);
    await db.insert(sessions).values({
      id: sessionId,
      boardPath: '/kilter/1/2/3/40',
      status: 'active',
      isPermanent: false,
      lastActivity,
    });

    await endStaleInactiveSessions(ONE_HOUR_MS);

    const [row] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
    expect(row?.status).toBe('ended');
    // endedAt mirrors the pre-sweep lastActivity so duration reflects when the
    // user actually stopped, not when the sweep ran.
    expect(row?.endedAt?.getTime()).toBe(lastActivity.getTime());
    // lastActivity itself is not touched by the sweep.
    expect(row?.lastActivity.getTime()).toBe(lastActivity.getTime());
  });

  it('uses the original lastActivity as endedAt even for sessions stale by hours', async () => {
    const sessionId = uuidv4();
    const lastActivity = minutesAgo(180);
    await db.insert(sessions).values({
      id: sessionId,
      boardPath: '/kilter/1/2/3/40',
      status: 'active',
      isPermanent: false,
      lastActivity,
    });

    await endStaleInactiveSessions(ONE_HOUR_MS);

    const [row] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
    expect(row?.status).toBe('ended');
    expect(row?.endedAt?.getTime()).toBe(lastActivity.getTime());
    expect(row?.lastActivity.getTime()).toBe(lastActivity.getTime());
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

    await endStaleInactiveSessions(ONE_HOUR_MS);

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

    await endStaleInactiveSessions(ONE_HOUR_MS);

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

    await endStaleInactiveSessions(ONE_HOUR_MS);

    const [row] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
    expect(row?.status).toBe('ended');
    expect(row?.endedAt?.getTime()).toBe(originalEndedAt.getTime());
  });

  it('ends only the stale, non-permanent rows across a mixed batch', async () => {
    const stale1 = uuidv4();
    const stale2 = uuidv4();
    const fresh = uuidv4();
    const permanent = uuidv4();
    const insertedIds = [stale1, stale2, fresh, permanent];

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

    await endStaleInactiveSessions(ONE_HOUR_MS);

    // Scope the readback to the rows we inserted so the assertion holds even
    // if a future change drops the global truncate in beforeEach.
    const rows = await db.select().from(sessions).where(inArray(sessions.id, insertedIds));
    const byId = new Map(rows.map((r) => [r.id, r.status]));
    expect(byId.get(stale1)).toBe('ended');
    expect(byId.get(stale2)).toBe('ended');
    expect(byId.get(fresh)).toBe('active');
    expect(byId.get(permanent)).toBe('active');
  });

  it('returns the ids of newly-ended sessions so the caller can fire SessionEnded and end Live Activities', async () => {
    const stale = uuidv4();
    const fresh = uuidv4();

    await db.insert(sessions).values([
      { id: stale, boardPath: '/kilter/1/2/3/40', status: 'active', isPermanent: false, lastActivity: minutesAgo(90) },
      { id: fresh, boardPath: '/kilter/1/2/3/40', status: 'active', isPermanent: false, lastActivity: minutesAgo(5) },
    ]);

    const endedIds = await endStaleInactiveSessions(ONE_HOUR_MS);

    expect(endedIds).toContain(stale);
    expect(endedIds).not.toContain(fresh);
  });
});

describe('RoomManager.runInactivitySweep', () => {
  // `roomManager.reset()` runs in the suite-wide `beforeEach` (setup.ts) and
  // is never followed by `initialize(redis)` here, so `distributedState`
  // stays null for every test in this file — i.e. the no-Redis,
  // single-instance fallback path that owns `localBoardSerialBySession` /
  // `localRecentClimbsBySession` is exactly what's under test.

  it('drains the local board-serial / recent-climbs shadows for swept sessions and still publishes SessionEnded', async () => {
    const staleSessionId = uuidv4();
    const climbUuid = uuidv4();
    const boardSerial = 'KB-AB12-CD34';

    await db.insert(sessions).values({
      id: staleSessionId,
      boardPath: '/kilter/1/2/3/40',
      status: 'active',
      isPermanent: false,
      lastActivity: minutesAgo(90),
    });

    // Seed the shadow maps via the same public paths the queue-navigation /
    // wall-confirm mutations use, rather than reaching into RoomManager's
    // private fields.
    await roomManager.setSessionBoardSerialAndReturnPrevious(staleSessionId, boardSerial);
    await roomManager.pushRecentClimb(staleSessionId, climbUuid);

    expect(await roomManager.getSessionBoardSerial(staleSessionId)).toBe(boardSerial);
    expect(await roomManager.isRecentClimb(staleSessionId, climbUuid)).toBe(true);

    const publishSpy = vi.spyOn(pubsub, 'publishSessionEvent').mockImplementation(() => {});

    await roomManager.runInactivitySweep();

    // Shadows are gone for the swept session.
    expect(await roomManager.getSessionBoardSerial(staleSessionId)).toBeNull();
    expect(await roomManager.isRecentClimb(staleSessionId, climbUuid)).toBe(false);

    // The sweep's existing side effect (publishing SessionEnded) still fires.
    expect(publishSpy).toHaveBeenCalledWith(staleSessionId, {
      __typename: 'SessionEnded',
      reason: 'Session ended due to inactivity',
    });

    const [row] = await db.select().from(sessions).where(eq(sessions.id, staleSessionId)).limit(1);
    expect(row?.status).toBe('ended');
  });

  it('leaves shadows for unrelated, still-active sessions untouched', async () => {
    const staleSessionId = uuidv4();
    const activeSessionId = uuidv4();
    const activeSerial = 'KB-EF56-GH78';

    await db.insert(sessions).values([
      {
        id: staleSessionId,
        boardPath: '/kilter/1/2/3/40',
        status: 'active',
        isPermanent: false,
        lastActivity: minutesAgo(90),
      },
      {
        id: activeSessionId,
        boardPath: '/kilter/1/2/3/40',
        status: 'active',
        isPermanent: false,
        lastActivity: minutesAgo(5),
      },
    ]);

    await roomManager.setSessionBoardSerialAndReturnPrevious(activeSessionId, activeSerial);

    vi.spyOn(pubsub, 'publishSessionEvent').mockImplementation(() => {});

    await roomManager.runInactivitySweep();

    expect(await roomManager.getSessionBoardSerial(activeSessionId)).toBe(activeSerial);

    const [row] = await db.select().from(sessions).where(eq(sessions.id, activeSessionId)).limit(1);
    expect(row?.status).toBe('active');
  });
});
