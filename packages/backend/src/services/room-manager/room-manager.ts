import type Redis from 'ioredis';
import type { ClimbQueueItem, SessionUser } from '@boardsesh/shared-schema';
import { RedisSessionStore } from '../redis-session-store';
import type { Session } from '../../db/schema';
import {
  type DistributedStateManager,
  initializeDistributedState,
  shutdownDistributedState,
  forceResetDistributedState,
} from '../distributed-state';
import { logger } from '../../utils/logger';
import type { ConnectedClient, DiscoverableSession, LocalSessionParticipant, QueueState } from './types';
import { WriteScheduler } from './write-scheduler';
import {
  updateQueueState as updateQueueStateFn,
  updateQueueStateImmediate as updateQueueStateImmediateFn,
  updateQueueOnly as updateQueueOnlyFn,
  getQueueState as getQueueStateFn,
} from './queue-state';
import {
  registerClient as registerClientFn,
  joinSession as joinSessionFn,
  leaveSession as leaveSessionFn,
  disconnectClient as disconnectClientFn,
  removeClient as removeClientFn,
  type SessionDisconnectResult,
  type SessionLeaveResult,
} from './client-lifecycle';
import { pubsub } from '../../pubsub/index';
import { endLiveActivity } from '../apns/index';
import type { SessionEvent } from '@boardsesh/shared-schema';
import {
  getSessionById as getSessionByIdFn,
  createDiscoverableSession as createDiscoverableSessionFn,
  findNearbySessions as findNearbySessionsFn,
  getUserSessions as getUserSessionsFn,
  endSession as endSessionFn,
  endStaleInactiveSessions,
} from './session-discovery';

const INACTIVITY_THRESHOLD_MS = 60 * 60 * 1000;
const INACTIVITY_SWEEP_INTERVAL_MS = 60 * 1000;

class RoomManager {
  private clients = new Map<string, ConnectedClient>();
  private sessions = new Map<string, Set<string>>();
  private sessionParticipants = new Map<string, Map<string, LocalSessionParticipant>>();
  private redisStore: RedisSessionStore | null = null;
  private distributedState: DistributedStateManager | null = null;
  // In-memory driver shadow: keeps single-instance / non-distributed deploys
  // consistent with the Redis-backed path. Always written alongside Redis so
  // `getSessionDriverParticipantId` returns the same answer either way.
  private localDriverBySession = new Map<string, string>();
  private sessionGraceTimers = new Map<string, NodeJS.Timeout>();
  private readonly SESSION_GRACE_PERIOD_MS = 60_000;
  private pendingJoinPersists = new Map<string, Promise<void>>();
  private writeScheduler = new WriteScheduler();
  private inactivitySweepInterval: NodeJS.Timeout | null = null;

  /**
   * Reset all state (for testing purposes)
   */
  reset(): void {
    for (const participants of this.sessionParticipants.values()) {
      for (const participant of participants.values()) {
        if (participant.reconnectTimer) {
          clearTimeout(participant.reconnectTimer);
        }
      }
    }

    this.clients.clear();
    this.sessions.clear();
    this.sessionParticipants.clear();
    this.localDriverBySession.clear();
    this.redisStore = null;
    this.distributedState = null;

    this.writeScheduler.reset();

    // Clear grace timers
    for (const timer of this.sessionGraceTimers.values()) {
      clearTimeout(timer);
    }
    this.sessionGraceTimers.clear();

    // Clear pending join persist promises
    this.pendingJoinPersists.clear();

    if (this.inactivitySweepInterval) {
      clearInterval(this.inactivitySweepInterval);
      this.inactivitySweepInterval = null;
    }

    // Reset the distributed state singleton so initialize() creates a fresh one
    forceResetDistributedState();
  }

  /**
   * Initialize RoomManager with Redis for session persistence and distributed state.
   * If Redis is not provided, falls back to Postgres-only mode (single instance).
   */
  async initialize(redis?: Redis): Promise<void> {
    if (redis) {
      this.redisStore = new RedisSessionStore(redis);
      logger.info('[RoomManager] Redis session storage enabled');

      this.distributedState = initializeDistributedState(redis);
      this.distributedState.start();
      logger.info('[RoomManager] Distributed state enabled for multi-instance support');
    } else {
      logger.info('[RoomManager] Redis not available - using Postgres only mode (single instance)');
    }

    if (!this.inactivitySweepInterval) {
      this.inactivitySweepInterval = setInterval(() => {
        endStaleInactiveSessions(INACTIVITY_THRESHOLD_MS)
          .then((endedIds) => {
            // For every auto-ended session, mirror the side effects of the
            // explicit endSession mutation: publish SessionEnded so connected
            // clients tear down, and end the iOS Live Activity so lock-screen
            // tiles don't linger with stale data until ActivityKit's stale
            // date elapses.
            for (const sessionId of endedIds) {
              const event: SessionEvent = {
                __typename: 'SessionEnded',
                reason: 'Session ended due to inactivity',
              };
              pubsub.publishSessionEvent(sessionId, event);
              endLiveActivity(sessionId).catch((err) => {
                logger.error(`[APNs] endLiveActivity failed for auto-ended session ${sessionId}:`, err);
              });
            }
          })
          .catch((err) => {
            logger.error('[RoomManager] Inactivity sweep failed:', err);
          });
      }, INACTIVITY_SWEEP_INTERVAL_MS);
      this.inactivitySweepInterval.unref();
      logger.info(
        `[RoomManager] Inactivity sweep enabled (threshold ${INACTIVITY_THRESHOLD_MS / 60000}m, interval ${INACTIVITY_SWEEP_INTERVAL_MS / 60000}m)`,
      );
    }
  }

  /**
   * Shutdown RoomManager and clean up distributed state.
   */
  async shutdown(): Promise<void> {
    await this.flushPendingWrites();
    if (this.inactivitySweepInterval) {
      clearInterval(this.inactivitySweepInterval);
      this.inactivitySweepInterval = null;
    }
    await shutdownDistributedState();
    logger.info('[RoomManager] Shutdown complete');
  }

  /**
   * Check if distributed state is enabled (multi-instance mode).
   */
  isDistributedStateEnabled(): boolean {
    return this.distributedState !== null;
  }

  async registerClient(connectionId: string, username?: string, userId?: string, avatarUrl?: string): Promise<string> {
    return registerClientFn(connectionId, this.clients, this.distributedState, username, userId, avatarUrl);
  }

  getClient(connectionId: string): ConnectedClient | undefined {
    return this.clients.get(connectionId);
  }

  getClientById(clientId: string): ConnectedClient | undefined {
    return this.clients.get(clientId);
  }

  async joinSession(
    connectionId: string,
    sessionId: string,
    boardPath: string,
    username?: string,
    avatarUrl?: string,
    initialQueue?: ClimbQueueItem[],
    initialCurrentClimb?: ClimbQueueItem | null,
    sessionName?: string,
    participantId?: string | null,
  ): Promise<{
    clientId: string;
    users: SessionUser[];
    queue: ClimbQueueItem[];
    currentClimbQueueItem: ClimbQueueItem | null;
    sequence: number;
    stateHash: string;
    isLeader: boolean;
    sessionName: string | null;
    participantId: string;
    participantWasKnown: boolean;
    participantWasReconnecting: boolean;
  }> {
    return joinSessionFn(
      connectionId,
      sessionId,
      boardPath,
      this.clients,
      this.sessions,
      this.sessionParticipants,
      this.redisStore,
      this.distributedState,
      this.writeScheduler,
      this.sessionGraceTimers,
      this.pendingJoinPersists,
      (sid) => this.getQueueState(sid),
      (sid) => this.getSessionUsers(sid),
      (sid) => this.getSessionUsersLocal(sid),
      (sid) => this.getSessionById(sid),
      (sid, q, c, v) => this.updateQueueStateImmediate(sid, q, c, v),
      (cid) => this.leaveSession(cid),
      username,
      avatarUrl,
      initialQueue,
      initialCurrentClimb,
      sessionName,
      participantId,
    );
  }

  async leaveSession(connectionId: string): Promise<SessionLeaveResult | null> {
    const result = await leaveSessionFn(
      connectionId,
      this.clients,
      this.sessions,
      this.sessionParticipants,
      this.redisStore,
      this.distributedState,
      this.writeScheduler,
      this.sessionGraceTimers,
      this.pendingJoinPersists,
      this.SESSION_GRACE_PERIOD_MS,
    );
    if (result?.participantFullyLeft && result.participantId) {
      // Explicit leave (vs. transient disconnect) drains the participant
      // immediately, so the driver role must follow. The disconnect path
      // handles its own cleanup via the grace-timer eviction callback.
      void this.releaseDriverIfMatches(result.sessionId, result.participantId);
    }
    return result;
  }

  async disconnectClient(connectionId: string): Promise<SessionDisconnectResult | null> {
    return disconnectClientFn(
      connectionId,
      this.clients,
      this.sessions,
      this.sessionParticipants,
      this.redisStore,
      this.distributedState,
      this.writeScheduler,
      this.sessionGraceTimers,
      this.pendingJoinPersists,
      this.SESSION_GRACE_PERIOD_MS,
      (sessionId, participantId) => {
        pubsub.publishSessionEvent(sessionId, {
          __typename: 'UserLeft',
          userId: participantId,
        });
        // If the evicted participant was the wall driver, clear and broadcast
        // so peers' Queue Control Bar UI flips out of the "{name} is driving"
        // state. Done after UserLeft so single-instance subscribers process
        // them in order. Across instances the two events flow through Redis
        // pub/sub independently and their relative arrival order at a remote
        // subscriber is not guaranteed — the spec tolerates this because
        // driver and presence are independent state machines.
        void this.releaseDriverIfMatches(sessionId, participantId);
      },
    );
  }

  /**
   * If the named participant currently holds the wall driver role, clear it
   * and publish `DriverChanged { driverParticipantId: null }`. No-op when the
   * participant is not the driver. Used on disconnect and explicit-leave
   * cleanup paths so the wall doesn't stay assigned to a vanished member.
   */
  private async releaseDriverIfMatches(sessionId: string, participantId: string): Promise<void> {
    try {
      const cleared = await this.clearSessionDriverIf(sessionId, participantId);
      if (cleared) {
        pubsub.publishSessionEvent(sessionId, {
          __typename: 'DriverChanged',
          driverParticipantId: null,
        });
      }
    } catch (error) {
      logger.error(
        `[RoomManager] Failed to release driver for departing participant ${participantId.slice(0, 8)} in session ${sessionId.slice(0, 8)}:`,
        error,
      );
    }
  }

  async removeClient(connectionId: string): Promise<{ distributedStateCleanedUp: boolean }> {
    return removeClientFn(connectionId, this.clients, this.sessions, this.distributedState);
  }

  /**
   * Get session users from all instances (async, uses distributed state if available).
   */
  async getSessionUsers(sessionId: string): Promise<SessionUser[]> {
    if (this.distributedState) {
      return this.distributedState.getSessionMembers(sessionId);
    }
    return this.getSessionUsersLocal(sessionId);
  }

  /**
   * Get session users from local instance only.
   */
  getSessionUsersLocal(sessionId: string): SessionUser[] {
    const participants = this.sessionParticipants.get(sessionId);
    if (participants && participants.size > 0) {
      return Array.from(participants.values()).map((participant) => ({
        id: participant.id,
        username: participant.username,
        isLeader: participant.isLeader,
        avatarUrl: participant.avatarUrl,
        userId: participant.userId,
        connectionState: participant.connectionState,
      }));
    }

    const sessionClientIds = this.sessions.get(sessionId);
    if (!sessionClientIds) return [];
    const users: SessionUser[] = [];
    for (const clientId of sessionClientIds) {
      const client = this.clients.get(clientId);
      if (client) {
        users.push({
          id: client.participantId || client.connectionId,
          username: client.username,
          isLeader: client.isLeader,
          avatarUrl: client.avatarUrl,
          userId: client.userId,
          connectionState: 'CONNECTED',
        });
      }
    }
    return users;
  }

  getSessionClients(sessionId: string): string[] {
    const session = this.sessions.get(sessionId);
    return session ? Array.from(session) : [];
  }

  /**
   * Get the authoritative leader connectionId for a session from distributed
   * state. Returns null when the session has no leader (or single-instance
   * mode falls back to local view). Use this instead of `SessionUser.isLeader`
   * for authorization checks — that field can be momentarily stale during
   * leader handoff, and a participant whose local `isLeader=true` reflects a
   * stale read could pass an authorization check after the leader has
   * already moved on.
   */
  async getSessionLeaderConnectionId(sessionId: string): Promise<string | null> {
    if (this.distributedState) {
      return this.distributedState.getSessionLeader(sessionId);
    }
    const clients = this.sessions.get(sessionId);
    if (!clients) return null;
    for (const clientId of clients) {
      const client = this.clients.get(clientId);
      if (client?.isLeader) return clientId;
    }
    return null;
  }

  /**
   * Get the current wall driver's participantId for a session, or null when
   * the wall is unclaimed. Driver is the wall-control authority introduced
   * by the queue-control-bar pivot's lightbulb gesture; distinct from leader
   * (which is presentation/legacy). Falls back to in-memory when running
   * without distributed state.
   */
  async getSessionDriverParticipantId(sessionId: string): Promise<string | null> {
    if (this.distributedState) {
      return this.distributedState.getSessionDriver(sessionId);
    }
    return this.localDriverBySession.get(sessionId) ?? null;
  }

  /**
   * Set the current wall driver atomically and return the previous driver
   * (or null when unclaimed). Yank-on-press: overwrites any prior driver.
   *
   * Atomicity matters: the `takeControl` resolver decides whether to publish
   * `DriverChanged` based on whether this was a transition. Without atomicity,
   * two concurrent yanks could each read the same previous driver and both
   * publish DriverChanged in arbitrary order — leaving subscribers' state
   * divergent from Redis. Both the distributed (Redis GETSET) and in-memory
   * paths return the previous value to keep callers consistent across modes.
   */
  async setSessionDriverAndReturnPrevious(sessionId: string, participantId: string): Promise<string | null> {
    const previousLocal = this.localDriverBySession.get(sessionId) ?? null;
    this.localDriverBySession.set(sessionId, participantId);
    if (this.distributedState) {
      // The Redis GETSET is the authoritative previous value across instances;
      // the local shadow's previous reading may be stale in multi-instance
      // mode, so prefer the distributed result.
      return this.distributedState.setSessionDriverAndReturnPrevious(sessionId, participantId);
    }
    return previousLocal;
  }

  /**
   * Conditionally clear the driver — only when the current driver matches
   * `expectedParticipantId`. Returns true when the clear happened (caller was
   * the driver). Used by releaseControl mutation.
   */
  async clearSessionDriverIf(sessionId: string, expectedParticipantId: string): Promise<boolean> {
    if (this.distributedState) {
      const cleared = await this.distributedState.clearSessionDriverIf(sessionId, expectedParticipantId);
      if (cleared && this.localDriverBySession.get(sessionId) === expectedParticipantId) {
        this.localDriverBySession.delete(sessionId);
      }
      return cleared;
    }
    if (this.localDriverBySession.get(sessionId) === expectedParticipantId) {
      this.localDriverBySession.delete(sessionId);
      return true;
    }
    return false;
  }

  /**
   * Unconditionally clear the driver. Used on driver-disconnect cleanup.
   */
  async clearSessionDriver(sessionId: string): Promise<void> {
    this.localDriverBySession.delete(sessionId);
    if (this.distributedState) {
      await this.distributedState.clearSessionDriver(sessionId);
    }
  }

  /**
   * Check if a session is active (has connected users across all instances OR exists in Redis within TTL)
   */
  async isSessionActive(sessionId: string): Promise<boolean> {
    if (this.distributedState) {
      const hasMembers = await this.distributedState.hasSessionMembers(sessionId);
      if (hasMembers) {
        return true;
      }
    } else {
      const participantCount = this.sessions.get(sessionId)?.size || 0;
      if (participantCount > 0) {
        return true;
      }
    }

    if (this.redisStore) {
      return this.redisStore.exists(sessionId);
    }
    return false;
  }

  async updateUsername(connectionId: string, username: string, avatarUrl?: string): Promise<void> {
    const client = this.clients.get(connectionId);
    if (client) {
      client.username = username;
      if (avatarUrl !== undefined) {
        client.avatarUrl = avatarUrl;
      }

      if (this.distributedState) {
        await this.distributedState.updateUsername(connectionId, username, avatarUrl);
      }
    }
  }

  async updateQueueState(
    sessionId: string,
    queue: ClimbQueueItem[],
    currentClimbQueueItem: ClimbQueueItem | null,
    expectedVersion?: number,
  ): Promise<{ version: number; sequence: number; stateHash: string; previousStateHash: string | null }> {
    return updateQueueStateFn(
      sessionId,
      queue,
      currentClimbQueueItem,
      expectedVersion,
      this.redisStore,
      this.writeScheduler,
      this.distributedState,
    );
  }

  async updateQueueStateImmediate(
    sessionId: string,
    queue: ClimbQueueItem[],
    currentClimbQueueItem: ClimbQueueItem | null,
    expectedVersion?: number,
  ): Promise<number> {
    return updateQueueStateImmediateFn(sessionId, queue, currentClimbQueueItem, expectedVersion, this.redisStore);
  }

  async updateQueueOnly(
    sessionId: string,
    queue: ClimbQueueItem[],
    expectedVersion?: number,
  ): Promise<{ version: number; sequence: number; stateHash: string }> {
    return updateQueueOnlyFn(
      sessionId,
      queue,
      expectedVersion,
      this.redisStore,
      this.writeScheduler,
      this.distributedState,
    );
  }

  async getQueueState(sessionId: string): Promise<QueueState> {
    return getQueueStateFn(sessionId, this.redisStore);
  }

  async getSessionById(sessionId: string): Promise<Session | null> {
    return getSessionByIdFn(sessionId);
  }

  async createDiscoverableSession(
    sessionId: string,
    boardPath: string,
    userId: string,
    latitude: number,
    longitude: number,
    name?: string,
    goal?: string,
    isPermanent?: boolean,
    color?: string,
  ): Promise<Session> {
    return createDiscoverableSessionFn(
      sessionId,
      boardPath,
      userId,
      latitude,
      longitude,
      name,
      goal,
      isPermanent,
      color,
    );
  }

  async findNearbySessions(latitude: number, longitude: number, radiusMeters?: number): Promise<DiscoverableSession[]> {
    return findNearbySessionsFn(
      latitude,
      longitude,
      radiusMeters,
      this.sessions,
      this.redisStore,
      this.distributedState,
    );
  }

  async getUserSessions(userId: string): Promise<Session[]> {
    return getUserSessionsFn(userId);
  }

  async endSession(sessionId: string): Promise<void> {
    return endSessionFn(
      sessionId,
      this.sessions,
      this.redisStore,
      this.writeScheduler,
      this.sessionGraceTimers,
      this.pendingJoinPersists,
    );
  }

  async flushPendingWrites(): Promise<void> {
    return this.writeScheduler.flushPendingWrites(this.sessionGraceTimers);
  }

  async refreshActiveSessionTTLs(): Promise<void> {
    const store = this.redisStore;
    if (!store) return;

    const activeSessions = Array.from(this.sessions.keys());
    if (activeSessions.length === 0) return;

    logger.info(`[RoomManager] Refreshing TTL for ${activeSessions.length} active sessions`);

    const batchSize = 50;
    for (let i = 0; i < activeSessions.length; i += batchSize) {
      const batch = activeSessions.slice(i, i + batchSize);
      await Promise.all(
        batch.map((sessionId) =>
          store
            .refreshTTL(sessionId)
            .catch((err) => logger.error(`[RoomManager] TTL refresh failed for ${sessionId}:`, err)),
        ),
      );
    }
  }
}

export { RoomManager };
