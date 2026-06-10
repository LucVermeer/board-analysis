/**
 * Tests for the sessionLiveness query (#2683).
 *
 * sessionLiveness reads the durable session row so an ended session reads as
 * ended even when no participants are connected — unlike `session`, which
 * returns null for any empty roster and so can't tell an ended session apart
 * from a dormant-but-active solo session. Clients call it on cold start to
 * decide whether to restore or drop a persisted session id.
 */

import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';

const dbClient = vi.hoisted(() => {
  const limit = vi.fn();
  return {
    limit,
    db: {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit,
    },
  };
});

// Mock connection-opening modules so importing the resolver barrel is side-effect-free.
vi.mock('../services/room-manager', () => ({ roomManager: {} }));
vi.mock('../pubsub/index', () => ({ pubsub: {} }));
vi.mock('../services/distributed-state', () => ({ getDistributedState: () => null }));
vi.mock('../db/client', () => ({ db: dbClient.db, dbRead: dbClient.db }));

import { sessionQueries } from '../graphql/resolvers/sessions/queries';

describe('sessionLiveness query', () => {
  beforeEach(() => {
    // limit holds per-test return values, so reset it; the chain stubs keep
    // their mockReturnThis impl but get their call history cleared.
    dbClient.limit.mockReset();
    dbClient.db.select.mockClear();
    dbClient.db.from.mockClear();
    dbClient.db.where.mockClear();
  });

  it('returns active liveness for a live session row', async () => {
    dbClient.limit.mockResolvedValue([{ id: 'session-1', status: 'active', endedAt: null }]);

    const result = await sessionQueries.sessionLiveness({}, { sessionId: 'session-1' });

    expect(result).toEqual({ id: 'session-1', status: 'active', endedAt: null });
  });

  it("normalizes a legacy 'inactive' row to active (CHECK-permitted, never written; restore-safe)", async () => {
    dbClient.limit.mockResolvedValue([{ id: 'session-1', status: 'inactive', endedAt: null }]);

    const result = await sessionQueries.sessionLiveness({}, { sessionId: 'session-1' });

    expect(result).toEqual({ id: 'session-1', status: 'active', endedAt: null });
  });

  it('reports an ended session (ISO endedAt) even with zero connected participants', async () => {
    dbClient.limit.mockResolvedValue([
      { id: 'session-1', status: 'ended', endedAt: new Date('2026-06-10T12:00:00.000Z') },
    ]);

    const result = await sessionQueries.sessionLiveness({}, { sessionId: 'session-1' });

    expect(result).toEqual({ id: 'session-1', status: 'ended', endedAt: '2026-06-10T12:00:00.000Z' });
  });

  it('returns null when the session row does not exist', async () => {
    dbClient.limit.mockResolvedValue([]);

    const result = await sessionQueries.sessionLiveness({}, { sessionId: 'session-gone' });

    expect(result).toBeNull();
  });

  it('rejects a malformed session id before querying', async () => {
    await expect(sessionQueries.sessionLiveness({}, { sessionId: 'bad id!' })).rejects.toThrow();
    expect(dbClient.limit).not.toHaveBeenCalled();
  });
});
