import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vite-plus/test';
import Redis from 'ioredis';
import { DistributedStateManager, forceResetDistributedState } from '../services/distributed-state';
import { KEYS } from '../services/distributed-state/constants';

// Integration tests: exercise the atomic reconnect/leave/expiry Lua transitions
// added for #2135 against a real Redis. Skips when Redis isn't reachable (same
// pattern as distributed-state.test.ts). Backend test infra auto-starts Redis.
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6380';

async function isRedisAvailable(): Promise<boolean> {
  const testRedis = new Redis(REDIS_URL, { connectTimeout: 1000, maxRetriesPerRequest: 0, lazyConnect: true });
  try {
    await testRedis.connect();
    await testRedis.ping();
    await testRedis.quit();
    return true;
  } catch {
    try {
      await testRedis.quit();
    } catch {
      // ignore
    }
    return false;
  }
}

const redisAvailable = await isRedisAvailable();

describe.skipIf(!redisAvailable)('session reconnect/leave atomicity (#2135)', () => {
  let redis: Redis;
  let manager: DistributedStateManager;

  beforeAll(async () => {
    redis = new Redis(REDIS_URL);
    await new Promise<void>((resolve) => redis.once('ready', resolve));
  });

  afterAll(async () => {
    forceResetDistributedState();
    await redis.quit();
  });

  beforeEach(async () => {
    forceResetDistributedState();
    const keys = await redis.keys('boardsesh:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    manager = new DistributedStateManager(redis, 'test-instance-atomicity');
  });

  afterEach(async () => {
    await manager.stop();
    forceResetDistributedState();
  });

  describe('markParticipantReconnectingIfIdle — passive disconnect cannot overwrite CONNECTED (crit D)', () => {
    it('marks RECONNECTING when the participant has no live connection', async () => {
      const session = 'sess-mark-1';
      await manager.registerConnection('mc-a', 'Ann', 'user-P');
      await manager.joinSession('mc-a', session, 'Ann', undefined, 'user-P');

      // Last connection drops: removeConnection dels the conn hash and srems it
      // from participantConnections, leaving the participant hash behind.
      await manager.removeConnection('mc-a', false);

      const result = await manager.markParticipantReconnectingIfIdle(session, 'user-P');
      expect(result.status).toBe('reconnecting');
      if (result.status === 'reconnecting') {
        expect(result.user.id).toBe('user-P');
        expect(result.user.connectionState).toBe('RECONNECTING');
      }
      expect(await redis.hget(KEYS.participant(session, 'user-P'), 'connectionState')).toBe('RECONNECTING');
    });

    it('skips the mark when a reconnect already landed on another connection', async () => {
      const session = 'sess-mark-2';
      await manager.registerConnection('mc-a', 'Ann', 'user-P');
      await manager.joinSession('mc-a', session, 'Ann', undefined, 'user-P');
      // Reconnect lands on a second connection for the same participant.
      await manager.registerConnection('mc-b', 'Ann', 'user-P');
      await manager.joinSession('mc-b', session, 'Ann', undefined, 'user-P');

      // The original connection's passive disconnect is now being processed.
      await manager.removeConnection('mc-a', false);

      const result = await manager.markParticipantReconnectingIfIdle(session, 'user-P');
      expect(result.status).toBe('has-live');
      // The fresher CONNECTED state is preserved, not clobbered to RECONNECTING.
      expect(await redis.hget(KEYS.participant(session, 'user-P'), 'connectionState')).toBe('CONNECTED');
    });

    it('reports missing when the participant hash is already gone', async () => {
      const result = await manager.markParticipantReconnectingIfIdle('sess-mark-3', 'ghost-P');
      expect(result.status).toBe('missing');
    });
  });

  describe('evictGhostParticipant — expiry atomicity (crit B) + expiry leader election', () => {
    it('evicts a ghost that is still RECONNECTING with no live connections', async () => {
      const session = 'sess-evict-1';
      await manager.registerConnection('ev-a', 'Ann', 'user-P');
      await manager.joinSession('ev-a', session, 'Ann', undefined, 'user-P');
      await manager.removeConnection('ev-a', false);
      await manager.markParticipantReconnectingIfIdle(session, 'user-P');

      const result = await manager.evictGhostParticipant(session, 'user-P');
      expect(result.status).toBe('evicted');
      expect(await redis.exists(KEYS.participant(session, 'user-P'))).toBe(0);
      const members = await manager.getSessionMembers(session);
      expect(members.find((member) => member.id === 'user-P')).toBeUndefined();
    });

    it('spares a participant that reconnected during the grace window (reconnect-before-expiry)', async () => {
      const session = 'sess-evict-2';
      await manager.registerConnection('ev-a', 'Ann', 'user-P');
      await manager.joinSession('ev-a', session, 'Ann', undefined, 'user-P');
      await manager.removeConnection('ev-a', false);
      await manager.markParticipantReconnectingIfIdle(session, 'user-P'); // → RECONNECTING

      // Grace-window reconnect on a fresh connection, same participant.
      await manager.registerConnection('ev-b', 'Ann', 'user-P');
      await manager.joinSession('ev-b', session, 'Ann', undefined, 'user-P');

      const result = await manager.evictGhostParticipant(session, 'user-P');
      // NOT evicted — the reconnect saved it. (JOIN flips it back to CONNECTED,
      // so the script returns not-reconnecting; either not-reconnecting or
      // has-live means "spared".)
      expect(['not-reconnecting', 'has-live']).toContain(result.status);
      expect(await redis.exists(KEYS.participant(session, 'user-P'))).toBe(1);
      expect(await manager.getParticipantLiveConnectionCount(session, 'user-P')).toBe(1);
    });

    it('re-elects a leader in the same transition when evicting a stale leader ghost', async () => {
      const session = 'sess-evict-3';
      // Leader participant P (lead-a) joins first, member participant Q (mem-b) after.
      await manager.registerConnection('lead-a', 'Leader', 'user-P');
      await manager.joinSession('lead-a', session, 'Leader', undefined, 'user-P');
      await manager.registerConnection('mem-b', 'Member', 'user-Q');
      await manager.joinSession('mem-b', session, 'Member', undefined, 'user-Q');
      expect(await manager.getSessionLeader(session)).toBe('lead-a');

      // Simulate the leader connection dropping WITHOUT removeConnection's
      // election (an instance crash between the connection delete and its
      // election), leaving the leader key pointing at a now-dead connection and
      // the participant parked RECONNECTING.
      await redis.del(KEYS.connection('lead-a'));
      await redis.srem(KEYS.sessionMembers(session), 'lead-a');
      await redis.srem(KEYS.participantConnections(session, 'user-P'), 'lead-a');
      await redis.hset(KEYS.participant(session, 'user-P'), 'connectionState', 'RECONNECTING');
      expect(await manager.getSessionLeader(session)).toBe('lead-a'); // still stale

      const result = await manager.evictGhostParticipant(session, 'user-P');
      expect(result.status).toBe('evicted');
      expect(result.newLeaderId).toBe('mem-b');
      expect(await manager.getSessionLeader(session)).toBe('mem-b');
      const memberConn = await manager.getConnection('mem-b');
      expect(memberConn?.isLeader).toBe(true);
    });

    it('does not re-elect when leadership already moved to a live member', async () => {
      const session = 'sess-evict-4';
      await manager.registerConnection('lead-a', 'Leader', 'user-P');
      await manager.joinSession('lead-a', session, 'Leader', undefined, 'user-P');
      await manager.registerConnection('mem-b', 'Member', 'user-Q');
      await manager.joinSession('mem-b', session, 'Member', undefined, 'user-Q');

      // The real disconnect path re-elects a live leader immediately.
      await manager.removeConnection('lead-a', true);
      expect(await manager.getSessionLeader(session)).toBe('mem-b');
      await manager.markParticipantReconnectingIfIdle(session, 'user-P');

      const result = await manager.evictGhostParticipant(session, 'user-P');
      expect(result.status).toBe('evicted');
      expect(result.newLeaderId).toBeNull(); // leader already healthy — no change
      expect(await manager.getSessionLeader(session)).toBe('mem-b');
    });
  });

  describe('leaveSession — same-participant leader preference (crit C)', () => {
    it('keeps leadership with the same participant when a multi-tab leader leaves one connection', async () => {
      const session = 'sess-leave-1';
      // Participant P holds two connections (two tabs); a different participant Q
      // holds one, connected between P's two tabs.
      await manager.registerConnection('p-tab1', 'Pat', 'user-P');
      await manager.joinSession('p-tab1', session, 'Pat', undefined, 'user-P'); // leader (joined first)
      await manager.registerConnection('q-only', 'Quinn', 'user-Q');
      await manager.joinSession('q-only', session, 'Quinn', undefined, 'user-Q');
      await manager.registerConnection('p-tab2', 'Pat', 'user-P');
      await manager.joinSession('p-tab2', session, 'Pat', undefined, 'user-P');

      // Deterministic connectedAt ordering tab1 < q-only < tab2, so a naive
      // earliest-connectedAt election would hand leadership to Q.
      await redis.hset(KEYS.connection('p-tab1'), 'connectedAt', '1000');
      await redis.hset(KEYS.connection('q-only'), 'connectedAt', '2000');
      await redis.hset(KEYS.connection('p-tab2'), 'connectedAt', '3000');
      expect(await manager.getSessionLeader(session)).toBe('p-tab1');

      // P leaves the leader tab while its other tab stays open.
      const result = await manager.leaveSession('p-tab1', session, 'user-P');

      // Leadership stays with participant P (its own p-tab2), NOT Q.
      expect(result.newLeaderId).toBe('p-tab2');
      expect(await manager.getSessionLeader(session)).toBe('p-tab2');
    });

    it('falls back to earliest-connectedAt when the leaving participant has no sibling connection', async () => {
      const session = 'sess-leave-2';
      await manager.registerConnection('lead', 'Lead', 'user-P');
      await manager.joinSession('lead', session, 'Lead', undefined, 'user-P');
      await manager.registerConnection('other', 'Other', 'user-Q');
      await manager.joinSession('other', session, 'Other', undefined, 'user-Q');
      await redis.hset(KEYS.connection('lead'), 'connectedAt', '1000');
      await redis.hset(KEYS.connection('other'), 'connectedAt', '2000');

      const result = await manager.leaveSession('lead', session, 'user-P');
      expect(result.newLeaderId).toBe('other');
      expect(await manager.getSessionLeader(session)).toBe('other');
    });
  });
});
