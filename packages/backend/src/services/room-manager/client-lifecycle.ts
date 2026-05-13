import type { ClimbQueueItem, SessionUser } from '@boardsesh/shared-schema';
import { db } from '../../db/client';
import { sessions, type Session } from '../../db/schema';
import type { RedisSessionStore } from '../redis-session-store';
import type { DistributedStateManager } from '../distributed-state';
import type { ConnectedClient } from './types';
import { restoreSessionWithLock } from './session-restoration';
import type { WriteScheduler } from './write-scheduler';

/**
 * Register a new client connection.
 */
export async function registerClient(
  connectionId: string,
  clients: Map<string, ConnectedClient>,
  distributedState: DistributedStateManager | null,
  username?: string,
  userId?: string,
  avatarUrl?: string,
): Promise<string> {
  const defaultUsername = username || `User-${connectionId.substring(0, 6)}`;
  clients.set(connectionId, {
    connectionId,
    sessionId: null,
    userId: userId || null,
    username: defaultUsername,
    isLeader: false,
    connectedAt: new Date(),
    avatarUrl,
  });

  if (distributedState) {
    try {
      await distributedState.registerConnection(connectionId, defaultUsername, userId, avatarUrl);
    } catch (err) {
      clients.delete(connectionId);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error(`[RoomManager] Failed to register connection in distributed state: ${errorMessage}`);
      throw new Error(`Failed to register client: distributed state error`);
    }
  }

  return connectionId;
}

/**
 * Join a session - handles restoration, leader election, and initial state setup.
 */
export async function joinSession(
  connectionId: string,
  sessionId: string,
  boardPath: string,
  clients: Map<string, ConnectedClient>,
  sessionsMap: Map<string, Set<string>>,
  redisStore: RedisSessionStore | null,
  distributedState: DistributedStateManager | null,
  writeScheduler: WriteScheduler,
  sessionGraceTimers: Map<string, NodeJS.Timeout>,
  pendingJoinPersists: Map<string, Promise<void>>,
  getQueueStateFn: (sessionId: string) => Promise<{
    queue: ClimbQueueItem[];
    currentClimbQueueItem: ClimbQueueItem | null;
    version: number;
    sequence: number;
    stateHash: string;
  }>,
  getSessionUsers: (sessionId: string) => Promise<SessionUser[]>,
  getSessionUsersLocal: (sessionId: string) => SessionUser[],
  getSessionById: (sessionId: string) => Promise<Session | null>,
  updateQueueStateImmediate: (
    sessionId: string,
    queue: ClimbQueueItem[],
    currentClimbQueueItem: ClimbQueueItem | null,
    expectedVersion?: number,
  ) => Promise<number>,
  leaveSessionFn: (connectionId: string) => Promise<{ sessionId: string; newLeaderId?: string } | null>,
  username?: string,
  avatarUrl?: string,
  initialQueue?: ClimbQueueItem[],
  initialCurrentClimb?: ClimbQueueItem | null,
  sessionName?: string,
): Promise<{
  clientId: string;
  users: SessionUser[];
  queue: ClimbQueueItem[];
  currentClimbQueueItem: ClimbQueueItem | null;
  sequence: number;
  stateHash: string;
  isLeader: boolean;
  sessionName: string | null;
}> {
  const client = clients.get(connectionId);
  if (!client) {
    throw new Error('Client not registered');
  }

  // Leave current session if in one
  if (client.sessionId) {
    await leaveSessionFn(connectionId);
  }

  // Update client info
  client.sessionId = sessionId;
  if (username) {
    client.username = username;
  }
  if (avatarUrl) {
    client.avatarUrl = avatarUrl;
  }

  // Track if this is a new session
  let isNewSession = false;

  // Cancel grace timer if session exists locally (client reconnecting during grace period)
  const graceTimer = sessionGraceTimers.get(sessionId);
  if (graceTimer) {
    clearTimeout(graceTimer);
    sessionGraceTimers.delete(sessionId);
    console.info(`[RoomManager] Cancelled grace timer for session ${sessionId} (client reconnecting)`);
  }

  // Create or get session in memory - with lazy restore
  if (!sessionsMap.has(sessionId)) {
    if (redisStore) {
      isNewSession = await restoreSessionWithLock(sessionId, sessionsMap, redisStore, getSessionById);
      if (isNewSession) {
        console.info(
          `[RoomManager] Creating new session ${sessionId} with ${initialQueue?.length || 0} initial queue items`,
        );
      }
    } else {
      // No Redis, check Postgres directly for session existence
      const pgSession = await getSessionById(sessionId);
      if (!pgSession || pgSession.status === 'ended') {
        isNewSession = true;
        console.info(
          `[RoomManager] Creating new session ${sessionId} with ${initialQueue?.length || 0} initial queue items`,
        );
      }
      sessionsMap.set(sessionId, new Set());
    }
  }
  const sessionClientIds = sessionsMap.get(sessionId)!;

  // Determine leader status
  let isLeader: boolean;

  if (distributedState) {
    const result = await distributedState.joinSession(connectionId, sessionId, client.username, client.avatarUrl);
    isLeader = result.isLeader;
  } else {
    isLeader = sessionClientIds.size === 0;
  }

  client.isLeader = isLeader;
  sessionClientIds.add(connectionId);

  // Ensure new sessions exist in Postgres before any queue state persists.
  // Existing sessions stay Redis-only for join/leave activity.
  if (isNewSession) {
    const previous = pendingJoinPersists.get(sessionId) ?? Promise.resolve();
    const chained = previous.then(() => ensureSessionRecordExists(sessionId, boardPath, client.userId, sessionName));

    pendingJoinPersists.set(sessionId, chained);
    try {
      await chained;
    } finally {
      if (pendingJoinPersists.get(sessionId) === chained) {
        pendingJoinPersists.delete(sessionId);
      }
    }
  }

  // Initialize queue state for new sessions with provided initial queue
  if (isNewSession && initialQueue && initialQueue.length > 0) {
    console.info(`[RoomManager] Initializing queue for new session ${sessionId} with ${initialQueue.length} items`);
    await updateQueueStateImmediate(sessionId, initialQueue, initialCurrentClimb || null, 0);
  }

  // Update Redis session state
  if (redisStore) {
    await Promise.all([redisStore.markActive(sessionId), redisStore.refreshTTL(sessionId)]);

    if (!distributedState) {
      const users = getSessionUsersLocal(sessionId);
      await redisStore.saveUsers(sessionId, users);
    }
  }

  // Get current session state
  const [users, queueState, sessionData] = await Promise.all([
    getSessionUsers(sessionId),
    getQueueStateFn(sessionId),
    getSessionById(sessionId),
  ]);
  const resolvedSessionName = sessionData?.name || null;

  return {
    clientId: connectionId,
    users,
    queue: queueState.queue,
    currentClimbQueueItem: queueState.currentClimbQueueItem,
    sequence: queueState.sequence,
    stateHash: queueState.stateHash,
    isLeader,
    sessionName: resolvedSessionName,
  };
}

/**
 * Leave a session - handles leader re-election and cleanup.
 */
export async function leaveSession(
  connectionId: string,
  clients: Map<string, ConnectedClient>,
  sessionsMap: Map<string, Set<string>>,
  redisStore: RedisSessionStore | null,
  distributedState: DistributedStateManager | null,
  writeScheduler: WriteScheduler,
  sessionGraceTimers: Map<string, NodeJS.Timeout>,
  pendingJoinPersists: Map<string, Promise<void>>,
  SESSION_GRACE_PERIOD_MS: number,
): Promise<{ sessionId: string; newLeaderId?: string } | null> {
  const client = clients.get(connectionId);
  if (!client || !client.sessionId) {
    return null;
  }

  const sessionId = client.sessionId;
  const wasLeader = client.isLeader;

  const sessionClientIds = sessionsMap.get(sessionId);
  const wentLocallyEmpty = sessionClientIds
    ? (sessionClientIds.delete(connectionId), sessionClientIds.size === 0)
    : false;

  if (wentLocallyEmpty) {
    const existingGraceTimer = sessionGraceTimers.get(sessionId);
    if (existingGraceTimer) clearTimeout(existingGraceTimer);

    const timer = setTimeout(() => {
      const currentClients = sessionsMap.get(sessionId);
      if (currentClients && currentClients.size === 0) {
        sessionsMap.delete(sessionId);
        console.info(`[RoomManager] Session ${sessionId} removed from memory after grace period`);
      }
      sessionGraceTimers.delete(sessionId);
    }, SESSION_GRACE_PERIOD_MS);
    sessionGraceTimers.set(sessionId, timer);
  }

  // Reset client state
  client.sessionId = null;
  client.isLeader = false;

  // Elect new leader. This also atomically removes our connection from
  // distributed state, so the post-leave membership re-check below sees
  // an accurate global view.
  let newLeaderId: string | undefined;

  if (distributedState) {
    const result = await distributedState.leaveSession(connectionId, sessionId);
    if (result.newLeaderId) {
      newLeaderId = result.newLeaderId;
      const localNewLeader = clients.get(newLeaderId);
      if (localNewLeader) {
        localNewLeader.isLeader = true;
      }
    }
  } else if (wasLeader && sessionClientIds && sessionClientIds.size > 0) {
    const clientsArray = Array.from(sessionClientIds)
      .map((id) => clients.get(id))
      .filter((c): c is ConnectedClient => c !== undefined)
      .sort((a, b) => a.connectedAt.getTime() - b.connectedAt.getTime());

    if (clientsArray.length > 0) {
      const newLeader = clientsArray[0];
      newLeader.isLeader = true;
      newLeaderId = newLeader.connectionId;
    }
  }

  // Decide whether to mark the session globally inactive and cancel pending
  // Postgres writes. The check must run AFTER `distributedState.leaveSession`
  // — querying members beforehand opens a TOCTOU race where two instances
  // concurrently see each other in the membership snapshot, both decide to
  // skip the inactive path, then both leave the session globally empty
  // without anyone calling `markInactive` or `cancelPendingWrites`. Running
  // the check after our own leave (and against the post-leave Redis set
  // membership) collapses both branches of that race into "the last
  // instance to leave wins and runs the cleanup".
  //
  // INVARIANT: `member.id` returned by `getSessionMembers` is the connection
  // ID, set in `services/distributed-state/session-ops.ts:181`:
  //   `id: connection.connectionId`
  // The empty-check below relies on that — if the field ever switches to a
  // user UUID, the leaving connection would no longer be subtracted by
  // `distributedState.leaveSession` from the same membership view, and the
  // emptiness signal would diverge from reality. The tests in
  // `__tests__/leave-session-multi-instance.test.ts` pin this contract.
  if (wentLocallyEmpty) {
    let globallyEmpty = true;
    if (distributedState) {
      try {
        const members = await distributedState.getSessionMembers(sessionId);
        globallyEmpty = members.length === 0;
      } catch (error) {
        // If the distributed check fails, default to the legacy behaviour
        // (mark inactive) rather than risk a leaked session.
        console.error(`[RoomManager] Failed to query distributed members for ${sessionId} during leaveSession:`, error);
      }
    }

    if (globallyEmpty) {
      writeScheduler.cancelPendingWrites(sessionId);

      if (redisStore) {
        await redisStore.markInactive(sessionId);
        if (!distributedState) {
          await redisStore.saveUsers(sessionId, []);
        }
        console.info(`[RoomManager] Session ${sessionId} marked inactive - grace period started (60s)`);
      }
    }

    // Await pending session insert for brand-new sessions.
    const pending = pendingJoinPersists.get(sessionId);
    if (pending) {
      await pending;
    }
  }

  return { sessionId, newLeaderId };
}

/**
 * Remove a client from the system entirely.
 */
export async function removeClient(
  connectionId: string,
  clients: Map<string, ConnectedClient>,
  sessionsMap: Map<string, Set<string>>,
  distributedState: DistributedStateManager | null,
): Promise<{ distributedStateCleanedUp: boolean }> {
  let distributedStateCleanedUp = true;

  if (distributedState) {
    try {
      const result = await distributedState.removeConnection(connectionId);
      if (result.newLeaderId) {
        console.info(`[RoomManager] New leader ${result.newLeaderId.slice(0, 8)} elected after client removal`);
      }
    } catch (err) {
      distributedStateCleanedUp = false;
      console.error(
        `[RoomManager] Failed to remove connection ${connectionId.slice(0, 8)} from distributed state. ` +
          `Redis data may remain until TTL expires. Error: ${String(err)}`,
      );
    }
  }

  const client = clients.get(connectionId);
  if (client?.sessionId) {
    const sessionSet = sessionsMap.get(client.sessionId);
    if (sessionSet) {
      sessionSet.delete(connectionId);
      if (sessionSet.size === 0) {
        sessionsMap.delete(client.sessionId);
      }
    }
  }
  clients.delete(connectionId);

  return { distributedStateCleanedUp };
}

/**
 * Ensure a session record exists in Postgres for durable history/summary reads.
 */
async function ensureSessionRecordExists(
  sessionId: string,
  boardPath: string,
  userId: string | null,
  sessionName?: string,
): Promise<void> {
  const now = new Date();
  await db
    .insert(sessions)
    .values({
      id: sessionId,
      boardPath,
      createdAt: now,
      lastActivity: now,
      latitude: null,
      longitude: null,
      discoverable: false,
      createdByUserId: userId,
      name: sessionName || null,
      startedAt: now,
    })
    .onConflictDoNothing();
}
