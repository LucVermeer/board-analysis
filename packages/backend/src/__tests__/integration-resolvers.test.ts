// @ts-nocheck — __tests__ is excluded from tsconfig.json, so the type-aware
// lint can't resolve node globals or `node:*` specifiers. Type-checking happens
// at test-run time via vitest.
import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';

// Mock the db client before importing the resolvers.
vi.mock('../db/client', () => {
  const mockDb = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
  return { db: mockDb };
});

// Mock the session-summary generator so the resolver path is deterministic.
vi.mock('../graphql/resolvers/sessions/session-summary', () => ({
  generateSessionSummary: vi.fn(),
}));

// Mock the export-service so we assert the resolver wiring, not the upload.
vi.mock('../integrations/export-service', () => ({
  syncPartySessionForUser: vi.fn(),
}));

// Rate limiting short-circuits in development; force it off explicitly.
process.env.NODE_ENV = 'development';

import { db } from '../db/client';
import { integrationQueries } from '../graphql/resolvers/integrations/queries';
import { integrationMutations } from '../graphql/resolvers/integrations/mutations';
import { generateSessionSummary } from '../graphql/resolvers/sessions/session-summary';
import { syncPartySessionForUser } from '../integrations/export-service';

function makeCtx(userId = 'user-1') {
  return { isAuthenticated: true, userId, connectionId: 'conn-1' };
}

function makeUnauthCtx() {
  return { isAuthenticated: false, userId: undefined, connectionId: 'conn-unauth' };
}

// Queue up the results that successive db.select(...).from(...).where(...) chains
// resolve to. Each chain consumes one entry from the queue in call order.
function setupSelectResults(results) {
  let index = 0;
  db.select.mockImplementation(() => {
    const current = index++;
    const resolved = results[current] ?? [];
    const chain = {
      from: vi.fn(() => chain),
      // `.where(...)` may be awaited directly (no `.limit`) or chained to
      // `.limit(...)`. Return a real Promise (so awaiting works) with a `.limit`
      // method attached (so the chained form works too).
      where: vi.fn(() => {
        const whereResult = Promise.resolve(resolved);
        whereResult.limit = vi.fn(() => Promise.resolve(resolved));
        return whereResult;
      }),
    };
    return chain;
  });
}

describe('integration query/mutation resolvers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('authentication', () => {
    it('integrations query rejects unauthenticated callers', async () => {
      await expect(integrationQueries.integrations(null, {}, makeUnauthCtx())).rejects.toThrow(
        'Authentication required',
      );
    });

    it('disconnectIntegration rejects unauthenticated callers', async () => {
      await expect(
        integrationMutations.disconnectIntegration(null, { provider: 'STRAVA' }, makeUnauthCtx()),
      ).rejects.toThrow('Authentication required');
    });

    it('setIntegrationAutoSync rejects unauthenticated callers', async () => {
      await expect(
        integrationMutations.setIntegrationAutoSync(null, { provider: 'STRAVA', enabled: true }, makeUnauthCtx()),
      ).rejects.toThrow('Authentication required');
    });

    it('syncSessionToIntegration rejects unauthenticated callers', async () => {
      await expect(
        integrationMutations.syncSessionToIntegration(
          null,
          { provider: 'STRAVA', sessionId: 'session-1' },
          makeUnauthCtx(),
        ),
      ).rejects.toThrow('Authentication required');
    });
  });

  describe('integrations query shape', () => {
    it('reports connected status from a credential row', async () => {
      const syncedAt = new Date('2026-06-01T00:00:00.000Z');
      setupSelectResults([
        [
          {
            provider: 'strava',
            externalAccountName: 'climber99',
            autoSyncEnabled: false,
            status: 'active',
            lastSyncAt: syncedAt,
            lastError: null,
          },
        ],
      ]);

      const result = await integrationQueries.integrations(null, {}, makeCtx());
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        provider: 'STRAVA',
        connected: true,
        externalAccountName: 'climber99',
        autoSyncEnabled: false,
        status: 'active',
        lastSyncAt: syncedAt.toISOString(),
        lastError: null,
      });
    });

    it('reports a not-connected default when no credential row exists', async () => {
      setupSelectResults([[]]);
      const result = await integrationQueries.integrations(null, {}, makeCtx());
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        provider: 'STRAVA',
        connected: false,
        externalAccountName: null,
        autoSyncEnabled: true,
        status: null,
        lastSyncAt: null,
        lastError: null,
      });
    });
  });

  describe('syncSessionToIntegration authorization', () => {
    it('throws when the session does not exist', async () => {
      setupSelectResults([[]]); // session lookup → empty
      await expect(
        integrationMutations.syncSessionToIntegration(null, { provider: 'STRAVA', sessionId: 'session-x' }, makeCtx()),
      ).rejects.toThrow('Session not found');
    });

    it('throws when the session has not ended', async () => {
      setupSelectResults([
        [{ createdByUserId: 'user-1', boardPath: 'kilter/1', startedAt: new Date(), endedAt: null }],
      ]);
      await expect(
        integrationMutations.syncSessionToIntegration(null, { provider: 'STRAVA', sessionId: 'session-x' }, makeCtx()),
      ).rejects.toThrow('Session has not ended');
    });

    it('throws when the caller is neither creator nor a participant', async () => {
      setupSelectResults([
        // session row: created by someone else, ended
        [{ createdByUserId: 'owner', boardPath: 'kilter/1', startedAt: new Date(), endedAt: new Date() }],
        // participant tick lookup → empty
        [],
      ]);
      await expect(
        integrationMutations.syncSessionToIntegration(
          null,
          { provider: 'STRAVA', sessionId: 'session-x' },
          makeCtx('not-a-member'),
        ),
      ).rejects.toThrow('Not a participant of this session');
    });

    it('returns the export result for an authorized creator', async () => {
      const startedAt = new Date('2026-06-01T10:00:00.000Z');
      const endedAt = new Date('2026-06-01T11:00:00.000Z');
      setupSelectResults([[{ createdByUserId: 'user-1', boardPath: 'kilter/1', startedAt, endedAt }]]);
      generateSessionSummary.mockResolvedValueOnce({
        sessionId: 'session-x',
        participants: [{ userId: 'user-1', sends: 3, attempts: 5 }],
        startedAt: startedAt.toISOString(),
        endedAt: endedAt.toISOString(),
        gradeDistribution: [],
      });
      syncPartySessionForUser.mockResolvedValueOnce({
        provider: 'STRAVA',
        sessionId: 'session-x',
        externalActivityId: '777',
        externalActivityUrl: 'https://www.strava.com/activities/777',
        syncedAt: '2026-06-01T11:05:00.000Z',
        error: null,
      });

      const result = await integrationMutations.syncSessionToIntegration(
        null,
        { provider: 'STRAVA', sessionId: 'session-x' },
        makeCtx('user-1'),
      );
      expect(result.externalActivityId).toBe('777');
      expect(syncPartySessionForUser).toHaveBeenCalledWith(
        'strava',
        'user-1',
        'session-x',
        expect.any(Object),
        'kilter/1',
        { allowErrorStatus: true },
      );
    });

    it('returns a result with the error field set when the upload throws', async () => {
      const startedAt = new Date('2026-06-01T10:00:00.000Z');
      const endedAt = new Date('2026-06-01T11:00:00.000Z');
      setupSelectResults([[{ createdByUserId: 'user-1', boardPath: 'kilter/1', startedAt, endedAt }]]);
      generateSessionSummary.mockResolvedValueOnce({
        sessionId: 'session-x',
        participants: [{ userId: 'user-1', sends: 1, attempts: 1 }],
        startedAt: startedAt.toISOString(),
        endedAt: endedAt.toISOString(),
        gradeDistribution: [],
      });
      syncPartySessionForUser.mockRejectedValueOnce(new Error('Strava activity upload failed with status 500'));

      const result = await integrationMutations.syncSessionToIntegration(
        null,
        { provider: 'STRAVA', sessionId: 'session-x' },
        makeCtx('user-1'),
      );
      expect(result.externalActivityId).toBeNull();
      expect(result.error).toMatch(/upload failed/i);
    });
  });
});
