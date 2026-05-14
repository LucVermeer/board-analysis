import type Redis from 'ioredis';
import {
  KEYS,
  TTL,
  UNSET_SENTINEL,
  validateConnectionId,
  connectionToHash,
  hashToConnection,
  type DistributedConnection,
} from './constants';
import { ELECT_NEW_LEADER_SCRIPT, UPDATE_USERNAME_SCRIPT } from './lua-scripts';

/**
 * Register a new connection in distributed state.
 */
export async function registerConnection(
  redis: Redis,
  instanceId: string,
  connectionId: string,
  username: string,
  userId?: string | null,
  avatarUrl?: string | null,
): Promise<void> {
  validateConnectionId(connectionId);

  const connection: DistributedConnection = {
    connectionId,
    instanceId,
    sessionId: null,
    participantId: null,
    userId: userId || null,
    username,
    avatarUrl: avatarUrl || null,
    isLeader: false,
    connectedAt: Date.now(),
  };

  const multi = redis.multi();

  // Store connection data
  multi.hmset(KEYS.connection(connectionId), connectionToHash(connection));
  multi.expire(KEYS.connection(connectionId), TTL.connection);

  // Track connection under this instance (with TTL so orphaned sets self-heal)
  multi.sadd(KEYS.instanceConnections(instanceId), connectionId);
  multi.expire(KEYS.instanceConnections(instanceId), 2 * 60 * 60); // 2 hours

  await multi.exec();

  console.info(
    `[DistributedState] Registered connection: ${connectionId.slice(0, 8)} on instance: ${instanceId.slice(0, 8)}`,
  );
}

/**
 * Get connection data from Redis.
 */
export async function getConnection(redis: Redis, connectionId: string): Promise<DistributedConnection | null> {
  validateConnectionId(connectionId);
  const data = await redis.hgetall(KEYS.connection(connectionId));
  if (!data || !data.connectionId) {
    return null;
  }
  return hashToConnection(data);
}

/**
 * Remove a connection from distributed state.
 * Automatically handles leader election if the removed connection was a leader.
 */
export async function removeConnection(
  redis: Redis,
  instanceId: string,
  connectionId: string,
  electNewLeader: boolean = true,
): Promise<{
  sessionId: string | null;
  participantId: string | null;
  wasLeader: boolean;
  newLeaderId: string | null;
  remainingParticipantConnections: number | null;
}> {
  validateConnectionId(connectionId);

  // Get current connection state
  const connection = await getConnection(redis, connectionId);
  if (!connection) {
    return {
      sessionId: null,
      participantId: null,
      wasLeader: false,
      newLeaderId: null,
      remainingParticipantConnections: null,
    };
  }

  const sessionId = connection.sessionId;
  const participantId = connection.participantId;
  const wasLeader = connection.isLeader;

  const multi = redis.multi();

  // Remove connection data
  multi.del(KEYS.connection(connectionId));

  // Remove from instance tracking
  multi.srem(KEYS.instanceConnections(instanceId), connectionId);

  // Remove from session if member
  if (sessionId) {
    multi.srem(KEYS.sessionMembers(sessionId), connectionId);
  }
  if (sessionId && participantId) {
    multi.srem(KEYS.participantConnections(sessionId, participantId), connectionId);
  }

  await multi.exec();

  console.info(`[DistributedState] Removed connection: ${connectionId.slice(0, 8)}`);

  let remainingParticipantConnections: number | null = null;
  if (sessionId && participantId) {
    remainingParticipantConnections = await countLiveParticipantConnections(redis, sessionId, participantId);
  }

  // Automatically elect new leader if was leader and requested
  let newLeaderId: string | null = null;
  if (sessionId && wasLeader && electNewLeader) {
    newLeaderId = await electLeaderAfterRemoval(redis, sessionId, connectionId);
  }

  return { sessionId, participantId, wasLeader, newLeaderId, remainingParticipantConnections };
}

async function countLiveParticipantConnections(
  redis: Redis,
  sessionId: string,
  participantId: string,
): Promise<number> {
  const key = KEYS.participantConnections(sessionId, participantId);
  const connectionIds = await redis.smembers(key);
  if (connectionIds.length === 0) {
    return 0;
  }

  const pipeline = redis.pipeline();
  for (const id of connectionIds) {
    pipeline.exists(KEYS.connection(id));
  }
  const results = await pipeline.exec();

  let live = 0;
  const staleIds: string[] = [];
  if (results) {
    for (let i = 0; i < results.length; i++) {
      const [err, exists] = results[i] as [Error | null, number];
      if (!err && exists === 1) {
        live++;
      } else if (!err) {
        staleIds.push(connectionIds[i]);
      }
    }
  }

  if (staleIds.length > 0) {
    await redis.srem(key, ...staleIds).catch(() => {});
  }

  return live;
}

/**
 * Elect a new leader after a connection is removed, with fallback logic.
 */
async function electLeaderAfterRemoval(redis: Redis, sessionId: string, connectionId: string): Promise<string | null> {
  try {
    const newLeaderId = (await redis.eval(
      ELECT_NEW_LEADER_SCRIPT,
      2,
      KEYS.sessionMembers(sessionId),
      KEYS.sessionLeader(sessionId),
      connectionId,
      TTL.sessionMembership.toString(),
      TTL.sessionMembership.toString(), // Leader TTL matches session TTL
    )) as string | null;

    if (newLeaderId) {
      console.info(
        `[DistributedState] Elected new leader: ${newLeaderId.slice(0, 8)} after removing ${connectionId.slice(0, 8)}`,
      );
    }
    return newLeaderId;
  } catch (err) {
    console.error(`[DistributedState] Failed to elect new leader after removing ${connectionId.slice(0, 8)}:`, err);
    // Fallback: try to manually elect a leader from remaining members
    return electLeaderFallback(redis, sessionId, connectionId);
  }
}

/**
 * Fallback leader election when Lua script fails.
 */
async function electLeaderFallback(redis: Redis, sessionId: string, connectionId: string): Promise<string | null> {
  try {
    const remainingMembers = await redis.smembers(KEYS.sessionMembers(sessionId));
    const candidates = remainingMembers.filter((id) => id !== connectionId);

    if (candidates.length > 0) {
      // Get connection data to find earliest connected
      const pipeline = redis.pipeline();
      for (const candidateId of candidates) {
        pipeline.hget(KEYS.connection(candidateId), 'connectedAt');
      }
      const results = await pipeline.exec();

      // Find earliest connected candidate
      let earliestCandidate: string | null = null;
      let earliestTime = Infinity;

      if (results) {
        for (let i = 0; i < candidates.length; i++) {
          const result = results[i];
          if (result && result[1]) {
            const connectedAt = parseInt(result[1] as string, 10);
            if (!isNaN(connectedAt) && connectedAt < earliestTime) {
              earliestTime = connectedAt;
              earliestCandidate = candidates[i];
            }
          }
        }
      }

      // Fall back to first candidate if no valid timestamps
      const chosenLeader = earliestCandidate || candidates[0];
      await redis.set(KEYS.sessionLeader(sessionId), chosenLeader, 'EX', TTL.sessionMembership);
      await redis.hset(KEYS.connection(chosenLeader), 'isLeader', 'true');
      console.info(
        `[DistributedState] Fallback elected leader: ${chosenLeader.slice(0, 8)} after removing ${connectionId.slice(0, 8)}`,
      );
      return chosenLeader;
    } else {
      // No candidates, clear the leader key
      await redis.del(KEYS.sessionLeader(sessionId));
      return null;
    }
  } catch {
    // Last resort: clear leader to allow next join to become leader
    try {
      await redis.del(KEYS.sessionLeader(sessionId));
    } catch {
      // Ignore cleanup error
    }
    return null;
  }
}

/**
 * Update connection username (and optionally avatar).
 */
export async function updateUsername(
  redis: Redis,
  connectionId: string,
  username: string,
  avatarUrl?: string,
): Promise<void> {
  validateConnectionId(connectionId);
  // Updates the connection hash AND the participant hash atomically (Lua).
  // Without the participant-side write, getSessionMembers (which prefers
  // sessionParticipants once it's populated) keeps returning the stale
  // username/avatar — peers see the old name until something else triggers
  // a refresh.
  await redis.eval(
    UPDATE_USERNAME_SCRIPT,
    1,
    KEYS.connection(connectionId),
    username,
    avatarUrl !== undefined ? avatarUrl || '' : UNSET_SENTINEL,
    TTL.sessionMembership.toString(),
  );
}
