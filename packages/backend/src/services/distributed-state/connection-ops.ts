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
import { UPDATE_USERNAME_SCRIPT } from './lua-scripts';
import { electNewLeaderAfterRemoval } from './leader-election';
import { logger } from '../../utils/logger';

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

  logger.info(
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

  logger.info(`[DistributedState] Removed connection: ${connectionId.slice(0, 8)}`);

  let remainingParticipantConnections: number | null = null;
  if (sessionId && participantId) {
    remainingParticipantConnections = await countLiveParticipantConnections(redis, sessionId, participantId);
  }

  // Automatically elect new leader if was leader and requested
  let newLeaderId: string | null = null;
  if (sessionId && wasLeader && electNewLeader) {
    const electionResult = await electNewLeaderAfterRemoval(redis, sessionId, connectionId, 'connection-removal');
    newLeaderId = electionResult.newLeaderId;
  }

  return { sessionId, participantId, wasLeader, newLeaderId, remainingParticipantConnections };
}

export async function countLiveParticipantConnections(
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
