import type Redis from 'ioredis';
import { KEYS, TTL, validateSessionId } from './constants';
import { LEADER_ELECTION_SCRIPT, ELECT_NEW_LEADER_SCRIPT } from './lua-scripts';
import { logger } from '../../utils/logger';

/**
 * Attempt to elect a connection as leader for a session.
 * Only succeeds if no leader currently exists.
 * Returns true if this connection became leader.
 */
export async function tryElectLeader(redis: Redis, connectionId: string, sessionId: string): Promise<boolean> {
  validateSessionId(sessionId);

  const result = (await redis.eval(
    LEADER_ELECTION_SCRIPT,
    2,
    KEYS.sessionLeader(sessionId),
    KEYS.connection(connectionId),
    connectionId,
    TTL.sessionMembership.toString(),
  )) as number;

  return result === 1;
}

/**
 * Distinguishes the two callers of `electNewLeaderAfterRemoval` for logging
 * purposes only — the election logic is identical either way. Ops
 * dashboards filter on the exact log text each call site has always
 * produced, so the messages are kept verbatim per context rather than
 * unified into one generic string.
 */
export type LeaderElectionContext = 'connection-removal' | 'leave-fallback';

export interface ElectedLeaderResult {
  newLeaderId: string | null;
  /** The elected leader's stable participantId, if the connection hash has one. Null when there's no new leader or the hash lacks it. */
  newLeaderParticipantId: string | null;
}

/**
 * Elect a new leader after a connection is removed from a session — either
 * because the connection itself was torn down (disconnect, heartbeat reap)
 * or because it explicitly left the session and the atomic
 * `LEAVE_SESSION_SCRIPT` round-trip failed.
 *
 * Tries the atomic `ELECT_NEW_LEADER_SCRIPT` first (single round trip, race
 * free). If the script call itself throws (Redis error, script load
 * failure, etc.) falls back to `electLeaderFallback`, a manual TS-side
 * election that reads session members and connection hashes directly and
 * picks the earliest-`connectedAt` candidate.
 *
 * This unifies what used to be two separate implementations:
 * `connection-ops.ts`'s removal path (Lua, then a real TS election on
 * failure) and `session-ops.ts`'s `leaveSessionFallback` (Lua, then just
 * clearing the leader key on failure — no real election). The leave path
 * now gets the same real-election fallback as connection removal.
 */
export async function electNewLeaderAfterRemoval(
  redis: Redis,
  sessionId: string,
  excludedConnectionId: string,
  context: LeaderElectionContext = 'connection-removal',
): Promise<ElectedLeaderResult> {
  let newLeaderId: string | null;

  try {
    newLeaderId = (await redis.eval(
      ELECT_NEW_LEADER_SCRIPT,
      2,
      KEYS.sessionMembers(sessionId),
      KEYS.sessionLeader(sessionId),
      excludedConnectionId,
      TTL.sessionMembership.toString(),
      TTL.sessionMembership.toString(), // Leader TTL matches session TTL
    )) as string | null;

    if (newLeaderId) {
      if (context === 'leave-fallback') {
        logger.info(
          `[DistributedState] Fallback: elected new leader ${newLeaderId.slice(0, 8)} for session ${sessionId.slice(0, 8)}`,
        );
      } else {
        logger.info(
          `[DistributedState] Elected new leader: ${newLeaderId.slice(0, 8)} after removing ${excludedConnectionId.slice(0, 8)}`,
        );
      }
    }
  } catch (err) {
    if (context === 'leave-fallback') {
      logger.error(`[DistributedState] Fallback leader election failed:`, err);
    } else {
      logger.error(
        `[DistributedState] Failed to elect new leader after removing ${excludedConnectionId.slice(0, 8)}:`,
        err,
      );
    }
    // Fallback: try to manually elect a leader from remaining members
    newLeaderId = await electLeaderFallback(redis, sessionId, excludedConnectionId, context);
  }

  return {
    newLeaderId,
    newLeaderParticipantId: await lookupParticipantId(redis, newLeaderId),
  };
}

/**
 * Fallback leader election when the Lua script fails.
 * Verbatim move from the former `connection-ops.ts::electLeaderFallback`,
 * except the success log is context-aware: the leave path never had a TS
 * election before this consolidation, so it gets its own message rather
 * than inheriting the removal path's "after removing" wording (which ops
 * dashboards may filter on).
 */
async function electLeaderFallback(
  redis: Redis,
  sessionId: string,
  connectionId: string,
  context: LeaderElectionContext,
): Promise<string | null> {
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
      if (context === 'leave-fallback') {
        logger.info(
          `[DistributedState] Fallback elected leader: ${chosenLeader.slice(0, 8)} for session ${sessionId.slice(0, 8)} after leave`,
        );
      } else {
        logger.info(
          `[DistributedState] Fallback elected leader: ${chosenLeader.slice(0, 8)} after removing ${connectionId.slice(0, 8)}`,
        );
      }
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

/** Best-effort lookup of a connection's stable participantId. Null if there's no connection, or it has none. */
async function lookupParticipantId(redis: Redis, connectionId: string | null): Promise<string | null> {
  if (!connectionId) return null;
  try {
    const data = await redis.hgetall(KEYS.connection(connectionId));
    return data?.participantId || null;
  } catch {
    return null;
  }
}
