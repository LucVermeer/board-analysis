import { logger } from '../../utils/logger';
/**
 * Connection data stored in Redis for cross-instance visibility.
 */
export type DistributedConnection = {
  connectionId: string;
  instanceId: string;
  sessionId: string | null;
  participantId: string | null;
  userId: string | null;
  username: string;
  avatarUrl: string | null;
  isLeader: boolean;
  connectedAt: number; // Unix timestamp ms
};

export type DistributedParticipant = {
  participantId: string;
  sessionId: string;
  userId: string | null;
  username: string;
  avatarUrl: string | null;
  connectionState: 'CONNECTED' | 'RECONNECTING';
  lastSeenAt: number;
};

/**
 * Redis key prefixes for distributed state.
 */
export const KEYS = {
  // Hash: connectionId -> connection data
  connection: (connectionId: string) => `boardsesh:conn:${connectionId}`,
  // Set: sessionId -> set of connectionIds
  sessionMembers: (sessionId: string) => `boardsesh:session:${sessionId}:members`,
  // Set: sessionId -> set of stable participantIds
  sessionParticipants: (sessionId: string) => `boardsesh:session:${sessionId}:participants`,
  // Hash: sessionId + participantId -> participant presence data
  participant: (sessionId: string, participantId: string) => `boardsesh:participant:${sessionId}:${participantId}`,
  // Set: sessionId + participantId -> live connectionIds for that participant
  participantConnections: (sessionId: string, participantId: string) =>
    `boardsesh:participant:${sessionId}:${participantId}:connections`,
  // String: sessionId -> connectionId of leader
  sessionLeader: (sessionId: string) => `boardsesh:session:${sessionId}:leader`,
  // String: sessionId -> participantId of the wall driver. Distinct from
  // sessionLeader: driver is stable across reconnects (keyed by participantId)
  // and is the wall-control authority introduced by the queue-control-bar
  // pivot's lightbulb gesture. Empty / missing key means "no driver" — the
  // wall is unclaimed.
  sessionDriver: (sessionId: string) => `boardsesh:session:${sessionId}:driver`,
  // Set: instanceId -> set of connectionIds owned by this instance
  instanceConnections: (instanceId: string) => `boardsesh:instance:${instanceId}:conns`,
  // String: instanceId -> heartbeat timestamp
  instanceHeartbeat: (instanceId: string) => `boardsesh:instance:${instanceId}:heartbeat`,
} as const;

/**
 * TTL values in seconds.
 */
export const TTL = {
  // Connection TTL is aligned with sessionMembership so a long-idle leader's
  // connection hash doesn't expire while the session keys still exist. The
  // prior 1h connection TTL left a window (between connection expiry and the
  // ~2-minute stale-member cleanup) where the leader key still pointed at a
  // dead connectionId; getLeaderParticipantId would return null and every
  // SessionUser.isLeader for the session was false until the cleanup ran.
  // REFRESH_TTL_SCRIPT bumps this on every connection refresh so an active
  // connection keeps itself alive regardless.
  connection: 4 * 60 * 60, // 4 hours - aligned with sessionMembership
  instanceHeartbeat: 60, // 1 minute - refreshed every 30s
  sessionMembership: 4 * 60 * 60, // 4 hours - matches session TTL
} as const;

// Sentinel value to indicate "don't update this field" in Lua scripts
export const UNSET_SENTINEL = '__UNSET__';

/**
 * Validate connectionId format to prevent Redis key injection.
 * ConnectionIds should be UUIDs or similar safe identifiers.
 */
export function validateConnectionId(connectionId: string): void {
  // Allow alphanumeric, hyphens, and underscores (UUID-compatible)
  // Max length prevents memory attacks
  if (!connectionId || connectionId.length > 128 || !/^[a-zA-Z0-9_-]+$/.test(connectionId)) {
    throw new Error(`Invalid connectionId format: ${connectionId.slice(0, 20)}`);
  }
}

/**
 * Validate sessionId format to prevent Redis key injection.
 */
export function validateSessionId(sessionId: string): void {
  if (!sessionId || sessionId.length > 128 || !/^[a-zA-Z0-9_-]+$/.test(sessionId)) {
    throw new Error(`Invalid sessionId format: ${sessionId.slice(0, 20)}`);
  }
}

export function validateParticipantId(participantId: string): void {
  if (!participantId || participantId.length > 128 || !/^[a-zA-Z0-9_-]+$/.test(participantId)) {
    throw new Error(`Invalid participantId format: ${participantId.slice(0, 20)}`);
  }
}

/**
 * Convert connection object to Redis hash fields.
 */
export function connectionToHash(conn: DistributedConnection): Record<string, string> {
  return {
    connectionId: conn.connectionId,
    instanceId: conn.instanceId,
    sessionId: conn.sessionId || '',
    participantId: conn.participantId || '',
    userId: conn.userId || '',
    username: conn.username,
    avatarUrl: conn.avatarUrl || '',
    isLeader: conn.isLeader ? 'true' : 'false',
    connectedAt: conn.connectedAt.toString(),
  };
}

/**
 * Convert Redis hash fields to connection object.
 * Note: Empty strings in Redis are treated as null/not set.
 * This is consistent with connectionToHash which converts null to empty string.
 */
export function hashToConnection(hash: Record<string, string>): DistributedConnection {
  // Empty string in Redis means "not set" - convert to null for consistency
  // This matches the pattern: null -> '' (storage) -> null (retrieval)
  const sessionId = hash.sessionId && hash.sessionId !== '' ? hash.sessionId : null;
  const participantId = hash.participantId && hash.participantId !== '' ? hash.participantId : null;
  const userId = hash.userId && hash.userId !== '' ? hash.userId : null;
  const avatarUrl = hash.avatarUrl && hash.avatarUrl !== '' ? hash.avatarUrl : null;

  // Parse connectedAt with warning for invalid values
  let connectedAt = parseInt(hash.connectedAt, 10);
  if (isNaN(connectedAt)) {
    logger.warn(
      `[DistributedState] Invalid connectedAt value "${hash.connectedAt}" for connection ${hash.connectionId?.slice(0, 8)}, using current time`,
    );
    connectedAt = Date.now();
  }

  return {
    connectionId: hash.connectionId,
    instanceId: hash.instanceId,
    sessionId,
    participantId,
    userId,
    username: hash.username,
    avatarUrl,
    isLeader: hash.isLeader === 'true',
    connectedAt,
  };
}
