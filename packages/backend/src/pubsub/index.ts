import type {
  QueueEvent,
  SessionEvent,
  NotificationEvent,
  CommentEvent,
  NewClimbCreatedEvent,
  BoardPresenceEvent,
  BoardPresenceClimb,
} from '@boardsesh/shared-schema';
import { redisClientManager } from '../redis/client';
import { createRedisPubSubAdapter, type RedisPubSubAdapter } from './redis-adapter';
import { logger } from '../utils/logger';

type QueueSubscriber = (event: QueueEvent) => void;
type SessionSubscriber = (event: SessionEvent) => void;
type NotificationSubscriber = (event: NotificationEvent) => void;
type CommentSubscriber = (event: CommentEvent) => void;
type NewClimbSubscriber = (event: NewClimbCreatedEvent) => void;
type BoardPresenceSubscriber = (event: BoardPresenceEvent) => void;

/** Result of the Stage-A report gate read (one pipeline, see `getBoardReportGate`). */
export type BoardReportGate = {
  /** Whether `emitterId` currently has a live proof-of-presence stamp on the board. */
  isMember: boolean;
  /** First-seen epoch-ms for the durable-history dwell gate, or null when unknown/implausible. */
  firstSeenMs: number | null;
  /** Value of `board:{id}:lastReport` ("emitterId|climbUuid|angle"), or null when never set / expired. */
  lastReport: string | null;
  /**
   * The board's current connection holder (`board:{id}:writer`), or null when
   * free / unknown. The dedup short-circuit must only fire while the retrying
   * emitter still holds the wall — a WS-close backstop clear between the
   * original send and the retry deletes the writer key but leaves lastReport,
   * and short-circuiting then would strand the wall looking free while the
   * emitter holds it (no re-take, no re-broadcast).
   */
  currentWriter: string | null;
};

export type CommitBoardClimbInput = {
  boardId: string;
  emitterId: string;
  climb: BoardPresenceClimb;
  climbUuid: string;
  effectiveAngle: number;
  /** The reporting connection's party-session id, when it's in one. */
  sessionId: string | null;
};

export type CommitBoardClimbResult = {
  /** The writer key's previous value (from the atomic SET..GET), or null when
   * the board was free / the commit failed. */
  previousWriter: string | null;
  /**
   * True only when the writer SET..GET slot actually executed without error —
   * i.e. `previousWriter` is a real observation, not a failure collapsed to
   * null. The caller must gate the hand-off broadcast on this: a failing
   * pipeline otherwise looks like "board was free" (`null !== emitterId`) and
   * would spuriously broadcast a hand-off + kick a Live Activity push on
   * every send while Redis is unhealthy.
   */
  writerSlotOk: boolean;
};

// Board-presence durable history (Redis FIFO) configuration. The live
// "now on the wall" feed is ephemeral; this buffer backfills late joiners
// before the `boardNowPlaying` subscription takes over.
const BOARD_HISTORY_SIZE = 50; // Keep the last 50 climbs per board
const BOARD_HISTORY_TTL = 604_800; // 1 week
// The per-board seq counter's TTL matches BOARD_HISTORY_TTL so the common
// case (an active board) never sees the counter expire while the Redis
// history buffer is still populated. But `board_climb_events` rows are
// durable forever, so a board dormant for *longer* than a week still has a
// live durable floor after this key expires — INCR would otherwise restart
// at 1 and collide with / precede rows that still exist in Postgres. That
// residual gap is closed by the dormancy reseed in `nextBoardSeq` (see
// `boardSeqFloorProvider` / `allocateBoardSeqAtLeast` below), not by this TTL
// alone.
const BOARD_SEQ_TTL = 604_800; // 1 week
// Once INCR returns a value at or below this, nextBoardSeq consults the
// durable floor provider — a small INCR result is the signature of a
// freshly-(re)created Redis key, which happens both for a genuinely new board
// and for a dormant board whose key just expired.
const BOARD_SEQ_RESEED_THRESHOLD = 50;
// Proof-of-presence window: how long after connecting (resolveBoardForSerial /
// resolveBoardForConfig) a user may report climbs to that board's feed. Long
// enough for a climbing session; a reconnect re-stamps it.
const BOARD_MEMBERSHIP_TTL = 43_200; // 12 hours
// Write-side idempotency window for reportBoardClimb: a retry of the exact
// same (emitter, climb, angle) within this window is treated as a no-op
// duplicate rather than a new send (see `getBoardReportGate` / A2 dedup).
const REPORT_DEDUP_WINDOW_MS = 10_000;
// Epoch-ms floor a first-seen stamp must clear to be trusted. Guards against
// legacy sentinel values (e.g. an old '1') that would otherwise trivially
// satisfy the durable-history dwell gate.
const PLAUSIBLE_EPOCH_MS_FLOOR = 1_600_000_000_000;

function parsePlausibleFirstSeenMs(raw: string | null): number | null {
  if (raw === null) return null;
  const firstSeen = Number(raw);
  if (!Number.isFinite(firstSeen) || firstSeen < PLAUSIBLE_EPOCH_MS_FLOOR) return null;
  return firstSeen;
}

/** External hook called after every queue event publish. Fire-and-forget. */
type QueueEventHook = (sessionId: string, event: QueueEvent) => void;

// Event buffer configuration (Phase 2: Delta sync)
const EVENT_BUFFER_SIZE = 100; // Store last 100 events per session
const EVENT_BUFFER_TTL = 300; // 5 minutes

/**
 * Hybrid PubSub that supports both local-only and Redis-backed modes.
 *
 * In Redis mode (multi-instance):
 * - Events are published to Redis channels
 * - Events from other instances are received and dispatched to local subscribers
 * - Local dispatch happens first for low latency
 *
 * In local-only mode (single instance, no Redis):
 * - Events are only dispatched to local subscribers
 * - Used when REDIS_URL is not configured
 */
class PubSub {
  private queueSubscribers = new Map<string, Set<QueueSubscriber>>();
  private sessionSubscribers = new Map<string, Set<SessionSubscriber>>();
  private notificationSubscribers = new Map<string, Set<NotificationSubscriber>>();
  private commentSubscribers = new Map<string, Set<CommentSubscriber>>();
  private newClimbSubscribers = new Map<string, Set<NewClimbSubscriber>>();
  private boardPresenceSubscribers = new Map<string, Set<BoardPresenceSubscriber>>();
  // Local-only fallback for the per-board monotonic seq counter. In Redis
  // mode the authoritative counter is `board:${boardId}:seq` (INCR); this map
  // only ever serves single-instance deployments that have no Redis.
  private localBoardSeq = new Map<string, number>();
  // Per-board watermark for the seq dormancy reseed (see
  // `ensureBoardSeqClearOfDurableFloor`): the highest seq this instance has
  // verified clear of the durable floor or allocated through the reseed
  // check. Lets a brand-new board skip the repeated MAX(seq) Postgres lookup
  // on each of its first ~BOARD_SEQ_RESEED_THRESHOLD sends. One number per
  // board that allocates during the process lifetime (bounded like
  // `localBoardSeq`); never TTL'd — see the safety analysis on the method.
  private boardSeqVerifiedThrough = new Map<string, number>();
  // Local-only proof-of-presence: `${boardId}:${userId}` → expiry epoch ms.
  private localBoardMembership = new Map<string, number>();
  private localBoardMembershipCleanupTimer: ReturnType<typeof setTimeout> | null = null;
  private localBoardMembershipCleanupExpiry: number | null = null;
  private redisAdapter: RedisPubSubAdapter | null = null;
  private initialized = false;
  private redisRequired = false;
  private queueEventHook: QueueEventHook | null = null;
  // Durable seq floor lookup for the `nextBoardSeq` dormancy reseed (A3).
  // Injected via `setBoardSeqFloorProvider` at bootstrap so pubsub itself
  // stays DB-free (and trivially unit-testable without Postgres). Defaults to
  // "no durable floor" — a board with no floor provider wired never reseeds,
  // matching pre-A3 behavior.
  private boardSeqFloorProvider: (boardId: number) => Promise<number> = async () => 0;

  /**
   * Initialize the PubSub system.
   * Connects to Redis if configured.
   *
   * @throws If Redis is configured but connection fails (fail-closed behavior)
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.redisRequired = redisClientManager.isRedisConfigured();

    if (this.redisRequired) {
      // Fail-closed: require Redis connection when configured
      const connected = await redisClientManager.connect();

      if (!connected) {
        throw new Error('Redis is configured but connection failed');
      }

      const { publisher, subscriber } = redisClientManager.getClients();
      this.redisAdapter = createRedisPubSubAdapter(publisher, subscriber);
      this.setupRedisMessageHandlers();

      logger.info(`[PubSub] Redis mode enabled (instance: ${this.redisAdapter.getInstanceId()})`);
    } else {
      logger.info('[PubSub] Local-only mode (single instance - no REDIS_URL configured)');
    }

    this.initialized = true;
  }

  /**
   * Check if Redis is connected and available.
   */
  isRedisConnected(): boolean {
    return this.redisAdapter !== null && redisClientManager.isRedisConnected();
  }

  /**
   * Check if Redis is required (REDIS_URL was configured at startup).
   */
  isRedisRequired(): boolean {
    return this.redisRequired;
  }

  /**
   * Get the unique ID assigned to this backend instance, or null when
   * running in local-only mode. Used to tag logs and correlate cross-instance
   * events.
   */
  getInstanceId(): string | null {
    return this.redisAdapter?.getInstanceId() ?? null;
  }

  /**
   * Register an external hook that fires after every queue event publish.
   * The hook is called fire-and-forget (not awaited, errors are caught internally).
   * Used to wire APNs Live Activity updates without coupling PubSub to the APNs service.
   *
   * **Publisher-side semantics (important for multi-instance deployments):**
   * The hook fires only on the instance that calls `publishQueueEvent`. It is
   * NOT invoked by `dispatchToLocalQueueSubscribers` when a Redis fan-out
   * message arrives from another instance — that path bypasses the hook
   * intentionally so a single event published in a 3-instance cluster does
   * not trigger 3 redundant APNs sends.
   *
   * Implication: every backend instance that receives queue mutations must
   * have APNs env vars configured, otherwise queue events that originate on
   * an unconfigured instance will skip the push (the hook still runs but
   * `sendLiveActivityUpdate` becomes a no-op when `configured === false`).
   * The startup log in `server.ts` warns when env vars are missing.
   */
  setQueueEventHook(hook: QueueEventHook): void {
    this.queueEventHook = hook;
  }

  /**
   * Inject the durable seq-floor lookup used by `nextBoardSeq`'s dormancy
   * reseed (A3). Wired once at backend bootstrap (`server.ts`) to a Drizzle
   * query over `board_climb_events`; defaults to `async () => 0` so pubsub
   * unit tests never need a database.
   */
  setBoardSeqFloorProvider(provider: (boardId: number) => Promise<number>): void {
    this.boardSeqFloorProvider = provider;
  }

  private setupRedisMessageHandlers(): void {
    if (!this.redisAdapter) return;

    this.redisAdapter.onQueueMessage((sessionId, event) => {
      this.dispatchToLocalQueueSubscribers(sessionId, event);
    });

    this.redisAdapter.onSessionMessage((sessionId, event) => {
      this.dispatchToLocalSessionSubscribers(sessionId, event);
    });

    this.redisAdapter.onNotificationMessage((userId, event) => {
      this.dispatchToLocalNotificationSubscribers(userId, event);
    });

    this.redisAdapter.onCommentMessage((entityKey, event) => {
      this.dispatchToLocalCommentSubscribers(entityKey, event);
    });

    this.redisAdapter.onNewClimbMessage((channelKey, event) => {
      this.dispatchToLocalNewClimbSubscribers(channelKey, event);
    });

    this.redisAdapter.onBoardPresenceMessage((boardId, event) => {
      this.dispatchToLocalBoardPresenceSubscribers(boardId, event);
    });
  }

  /**
   * Subscribe to queue events for a session.
   * @returns Promise that resolves to an unsubscribe function
   * @throws If Redis is required but not connected, or if Redis subscription fails
   */
  async subscribeQueue(sessionId: string, callback: QueueSubscriber): Promise<() => void> {
    this.ensureRedisIfRequired();

    const isFirstSubscriber = !this.queueSubscribers.has(sessionId);

    if (!this.queueSubscribers.has(sessionId)) {
      this.queueSubscribers.set(sessionId, new Set());
    }
    this.queueSubscribers.get(sessionId)!.add(callback);

    // Subscribe to Redis channel if this is first local subscriber for session
    // IMPORTANT: We must await this to ensure Redis subscription is active
    // before returning, otherwise events from other instances could be missed
    if (isFirstSubscriber && this.redisAdapter) {
      try {
        await this.redisAdapter.subscribeQueueChannel(sessionId);
      } catch (error) {
        logger.error(`[PubSub] Failed to subscribe to Redis queue channel: ${String(error)}`);
        // Remove the subscriber since Redis subscription failed
        this.queueSubscribers.get(sessionId)?.delete(callback);
        if (this.queueSubscribers.get(sessionId)?.size === 0) {
          this.queueSubscribers.delete(sessionId);
        }
        if (this.redisRequired) {
          throw error;
        }
      }
    }

    return () => {
      this.queueSubscribers.get(sessionId)?.delete(callback);

      // Clean up empty sets and unsubscribe from Redis
      if (this.queueSubscribers.get(sessionId)?.size === 0) {
        this.queueSubscribers.delete(sessionId);

        if (this.redisAdapter) {
          this.redisAdapter.unsubscribeQueueChannel(sessionId).catch((error) => {
            logger.error(`[PubSub] Failed to unsubscribe from Redis queue channel: ${String(error)}`);
          });
        }
      }
    };
  }

  /**
   * Subscribe to session events (user joins/leaves, leader changes).
   * @returns Promise that resolves to an unsubscribe function
   * @throws If Redis is required but not connected, or if Redis subscription fails
   */
  async subscribeSession(sessionId: string, callback: SessionSubscriber): Promise<() => void> {
    this.ensureRedisIfRequired();

    const isFirstSubscriber = !this.sessionSubscribers.has(sessionId);

    if (!this.sessionSubscribers.has(sessionId)) {
      this.sessionSubscribers.set(sessionId, new Set());
    }
    this.sessionSubscribers.get(sessionId)!.add(callback);

    // Subscribe to Redis channel if this is first local subscriber for session
    // IMPORTANT: We must await this to ensure Redis subscription is active
    // before returning, otherwise events from other instances could be missed
    if (isFirstSubscriber && this.redisAdapter) {
      try {
        await this.redisAdapter.subscribeSessionChannel(sessionId);
      } catch (error) {
        logger.error(`[PubSub] Failed to subscribe to Redis session channel: ${String(error)}`);
        // Remove the subscriber since Redis subscription failed
        this.sessionSubscribers.get(sessionId)?.delete(callback);
        if (this.sessionSubscribers.get(sessionId)?.size === 0) {
          this.sessionSubscribers.delete(sessionId);
        }
        if (this.redisRequired) {
          throw error;
        }
      }
    }

    return () => {
      this.sessionSubscribers.get(sessionId)?.delete(callback);

      // Clean up empty sets and unsubscribe from Redis
      if (this.sessionSubscribers.get(sessionId)?.size === 0) {
        this.sessionSubscribers.delete(sessionId);

        if (this.redisAdapter) {
          this.redisAdapter.unsubscribeSessionChannel(sessionId).catch((error) => {
            logger.error(`[PubSub] Failed to unsubscribe from Redis session channel: ${String(error)}`);
          });
        }
      }
    };
  }

  /**
   * Store a queue event in the event buffer for delta sync (Phase 2).
   * Events are stored in a Redis list with a TTL.
   */
  private async storeEventInBuffer(sessionId: string, event: QueueEvent): Promise<void> {
    if (!this.redisAdapter) {
      // No Redis - skip event buffering (will fallback to full sync)
      return;
    }

    try {
      const { publisher } = redisClientManager.getClients();
      const bufferKey = `session:${sessionId}:events`;
      const eventJson = JSON.stringify(event);

      // Add to front of list (newest events first)
      await publisher.lpush(bufferKey, eventJson);
      // Trim to keep only last N events
      await publisher.ltrim(bufferKey, 0, EVENT_BUFFER_SIZE - 1);
      // Set TTL (5 minutes)
      await publisher.expire(bufferKey, EVENT_BUFFER_TTL);
    } catch (error) {
      logger.error('[PubSub] Failed to store event in buffer:', error);
      // Don't throw - event buffering is optional (will fallback to full sync)
    }
  }

  /**
   * Retrieve events since a given sequence number (Phase 2).
   * Used for delta sync on reconnection.
   * Returns events in ascending sequence order.
   *
   * Defensively drops any `PlaybackStateChanged` entries found in the buffer.
   * `publishQueueEvent` no longer writes them (see `storeEventInBuffer` call
   * site below), but during a mixed-version rollout an old instance may still
   * have buffered one within the 5-minute TTL — its reused, non-monotonic
   * sequence would otherwise break the client's replay-contiguity check.
   */
  async getEventsSince(sessionId: string, sinceSequence: number): Promise<QueueEvent[]> {
    if (!this.redisAdapter) {
      throw new Error('Event buffer requires Redis');
    }

    try {
      const { publisher } = redisClientManager.getClients();
      const bufferKey = `session:${sessionId}:events`;

      // Get all events from buffer (newest first due to lpush)
      const eventJsons = await publisher.lrange(bufferKey, 0, -1);

      // Parse and filter events
      const events: QueueEvent[] = [];
      for (const json of eventJsons) {
        try {
          const event = JSON.parse(json) as QueueEvent;
          if (event.__typename === 'PlaybackStateChanged') {
            continue;
          }
          if (event.sequence > sinceSequence) {
            events.push(event);
          }
        } catch (parseError) {
          logger.error('[PubSub] Failed to parse buffered event:', parseError);
        }
      }

      // Sort by sequence (ascending) since buffer is newest-first
      events.sort((a, b) => a.sequence - b.sequence);

      return events;
    } catch (error) {
      logger.error('[PubSub] Failed to retrieve events from buffer:', error);
      throw error;
    }
  }

  /**
   * Publish a queue event to all subscribers of a session.
   * Dispatches locally first, then publishes to Redis for other instances.
   * Also stores event in buffer for delta sync (Phase 2).
   *
   * `PlaybackStateChanged` events are excluded from buffering: they reuse the
   * room's current sequence number (rather than incrementing it) and can fire
   * up to 3600/min, so buffering them would both evict real queue events from
   * the 100-entry buffer within seconds and hand replaying clients
   * non-monotonic/duplicate sequences. See `publishPlaybackState` in
   * `graphql/resolvers/queue/mutations.ts`.
   *
   * Note: Redis publish errors are logged but not thrown to avoid blocking
   * the local dispatch. In Redis mode, events may not reach other instances
   * if Redis publish fails.
   */
  publishQueueEvent(sessionId: string, event: QueueEvent): void {
    // Always dispatch to local subscribers first (low latency)
    this.dispatchToLocalQueueSubscribers(sessionId, event);

    // Store event in buffer for delta sync (Phase 2), except playback events
    // (see docstring above). Fire and forget - don't block on buffer storage.
    if (event.__typename !== 'PlaybackStateChanged') {
      this.storeEventInBuffer(sessionId, event).catch((error) => {
        logger.error(`[PubSub] Failed to buffer event for session ${sessionId}:`, error);
        // Non-fatal: clients will fall back to full sync if delta sync fails
      });
    }

    // Also publish to Redis if available
    if (this.redisAdapter) {
      this.redisAdapter.publishQueueEvent(sessionId, event).catch((error) => {
        logger.error('[PubSub] Redis queue publish failed:', error);
        // Log but don't throw - local dispatch already succeeded
        // Health check will report Redis as unhealthy if connection is lost
      });
    }

    // Fire external hook (e.g. APNs Live Activity updates)
    if (this.queueEventHook) {
      try {
        this.queueEventHook(sessionId, event);
      } catch (error) {
        logger.error('[PubSub] Queue event hook error:', error);
      }
    }
  }

  /**
   * Publish a session event to all subscribers.
   * Dispatches locally first, then publishes to Redis for other instances.
   *
   * Note: Redis publish errors are logged but not thrown to avoid blocking
   * the local dispatch. In Redis mode, events may not reach other instances
   * if Redis publish fails.
   */
  publishSessionEvent(sessionId: string, event: SessionEvent): void {
    // Always dispatch to local subscribers first (low latency)
    this.dispatchToLocalSessionSubscribers(sessionId, event);

    // Also publish to Redis if available
    if (this.redisAdapter) {
      this.redisAdapter.publishSessionEvent(sessionId, event).catch((error) => {
        logger.error('[PubSub] Redis session publish failed:', error);
        // Log but don't throw - local dispatch already succeeded
        // Health check will report Redis as unhealthy if connection is lost
      });
    }
  }

  private dispatchToLocalQueueSubscribers(sessionId: string, event: QueueEvent): void {
    const subscribers = this.queueSubscribers.get(sessionId);
    if (subscribers) {
      for (const callback of subscribers) {
        try {
          callback(event);
        } catch (error) {
          logger.error('Error in queue subscriber:', error);
        }
      }
    }
  }

  private dispatchToLocalSessionSubscribers(sessionId: string, event: SessionEvent): void {
    const subscribers = this.sessionSubscribers.get(sessionId);
    if (subscribers) {
      for (const callback of subscribers) {
        try {
          callback(event);
        } catch (error) {
          logger.error('Error in session subscriber:', error);
        }
      }
    }
  }

  /**
   * Subscribe to notification events for a user.
   * @returns Promise that resolves to an unsubscribe function
   */
  async subscribeNotifications(userId: string, callback: NotificationSubscriber): Promise<() => void> {
    this.ensureRedisIfRequired();

    const isFirstSubscriber = !this.notificationSubscribers.has(userId);

    if (!this.notificationSubscribers.has(userId)) {
      this.notificationSubscribers.set(userId, new Set());
    }
    this.notificationSubscribers.get(userId)!.add(callback);

    if (isFirstSubscriber && this.redisAdapter) {
      try {
        await this.redisAdapter.subscribeNotificationChannel(userId);
      } catch (error) {
        logger.error(`[PubSub] Failed to subscribe to Redis notification channel: ${String(error)}`);
        this.notificationSubscribers.get(userId)?.delete(callback);
        if (this.notificationSubscribers.get(userId)?.size === 0) {
          this.notificationSubscribers.delete(userId);
        }
        if (this.redisRequired) {
          throw error;
        }
      }
    }

    return () => {
      this.notificationSubscribers.get(userId)?.delete(callback);
      if (this.notificationSubscribers.get(userId)?.size === 0) {
        this.notificationSubscribers.delete(userId);
        if (this.redisAdapter) {
          this.redisAdapter.unsubscribeNotificationChannel(userId).catch((error) => {
            logger.error(`[PubSub] Failed to unsubscribe from Redis notification channel: ${String(error)}`);
          });
        }
      }
    };
  }

  /**
   * Publish a notification event to a user.
   * Dispatches locally first, then publishes to Redis for other instances.
   */
  publishNotificationEvent(userId: string, event: NotificationEvent): void {
    this.dispatchToLocalNotificationSubscribers(userId, event);

    if (this.redisAdapter) {
      this.redisAdapter.publishNotificationEvent(userId, event).catch((error) => {
        logger.error('[PubSub] Redis notification publish failed:', error);
      });
    }
  }

  private dispatchToLocalNotificationSubscribers(userId: string, event: NotificationEvent): void {
    const subscribers = this.notificationSubscribers.get(userId);
    if (subscribers) {
      for (const callback of subscribers) {
        try {
          callback(event);
        } catch (error) {
          logger.error('Error in notification subscriber:', error);
        }
      }
    }
  }

  /**
   * Subscribe to comment events for an entity.
   * @param entityKey format: `${entityType}:${entityId}`
   * @returns Promise that resolves to an unsubscribe function
   */
  async subscribeComments(entityKey: string, callback: CommentSubscriber): Promise<() => void> {
    this.ensureRedisIfRequired();

    const isFirstSubscriber = !this.commentSubscribers.has(entityKey);

    if (!this.commentSubscribers.has(entityKey)) {
      this.commentSubscribers.set(entityKey, new Set());
    }
    this.commentSubscribers.get(entityKey)!.add(callback);

    if (isFirstSubscriber && this.redisAdapter) {
      try {
        await this.redisAdapter.subscribeCommentChannel(entityKey);
      } catch (error) {
        logger.error(`[PubSub] Failed to subscribe to Redis comment channel: ${String(error)}`);
        this.commentSubscribers.get(entityKey)?.delete(callback);
        if (this.commentSubscribers.get(entityKey)?.size === 0) {
          this.commentSubscribers.delete(entityKey);
        }
        if (this.redisRequired) {
          throw error;
        }
      }
    }

    return () => {
      this.commentSubscribers.get(entityKey)?.delete(callback);
      if (this.commentSubscribers.get(entityKey)?.size === 0) {
        this.commentSubscribers.delete(entityKey);
        if (this.redisAdapter) {
          this.redisAdapter.unsubscribeCommentChannel(entityKey).catch((error) => {
            logger.error(`[PubSub] Failed to unsubscribe from Redis comment channel: ${String(error)}`);
          });
        }
      }
    };
  }

  /**
   * Publish a comment event for an entity.
   * Dispatches locally first, then publishes to Redis for other instances.
   */
  publishCommentEvent(entityKey: string, event: CommentEvent): void {
    this.dispatchToLocalCommentSubscribers(entityKey, event);

    if (this.redisAdapter) {
      this.redisAdapter.publishCommentEvent(entityKey, event).catch((error) => {
        logger.error('[PubSub] Redis comment publish failed:', error);
      });
    }
  }

  private dispatchToLocalCommentSubscribers(entityKey: string, event: CommentEvent): void {
    const subscribers = this.commentSubscribers.get(entityKey);
    if (subscribers) {
      for (const callback of subscribers) {
        try {
          callback(event);
        } catch (error) {
          logger.error('Error in comment subscriber:', error);
        }
      }
    }
  }

  /**
   * Subscribe to new climb events for a board type + layout combination.
   * @param channelKey format: `${boardType}:${layoutId}`
   */
  async subscribeNewClimbs(channelKey: string, callback: NewClimbSubscriber): Promise<() => void> {
    this.ensureRedisIfRequired();

    const isFirstSubscriber = !this.newClimbSubscribers.has(channelKey);

    if (!this.newClimbSubscribers.has(channelKey)) {
      this.newClimbSubscribers.set(channelKey, new Set());
    }
    this.newClimbSubscribers.get(channelKey)!.add(callback);

    if (isFirstSubscriber && this.redisAdapter) {
      try {
        await this.redisAdapter.subscribeNewClimbChannel(channelKey);
      } catch (error) {
        logger.error(`[PubSub] Failed to subscribe to Redis new climb channel: ${String(error)}`);
        this.newClimbSubscribers.get(channelKey)?.delete(callback);
        if (this.newClimbSubscribers.get(channelKey)?.size === 0) {
          this.newClimbSubscribers.delete(channelKey);
        }
        if (this.redisRequired) {
          throw error;
        }
      }
    }

    return () => {
      this.newClimbSubscribers.get(channelKey)?.delete(callback);
      if (this.newClimbSubscribers.get(channelKey)?.size === 0) {
        this.newClimbSubscribers.delete(channelKey);
        if (this.redisAdapter) {
          this.redisAdapter.unsubscribeNewClimbChannel(channelKey).catch((error) => {
            logger.error(`[PubSub] Failed to unsubscribe from Redis new climb channel: ${String(error)}`);
          });
        }
      }
    };
  }

  /**
   * Publish a new climb event to subscribers.
   */
  publishNewClimbEvent(channelKey: string, event: NewClimbCreatedEvent): void {
    this.dispatchToLocalNewClimbSubscribers(channelKey, event);

    if (this.redisAdapter) {
      this.redisAdapter.publishNewClimbEvent(channelKey, event).catch((error) => {
        logger.error('[PubSub] Redis new climb publish failed:', error);
      });
    }
  }

  private dispatchToLocalNewClimbSubscribers(channelKey: string, event: NewClimbCreatedEvent): void {
    const subscribers = this.newClimbSubscribers.get(channelKey);
    if (subscribers) {
      for (const callback of subscribers) {
        try {
          callback(event);
        } catch (error) {
          logger.error('Error in new climb subscriber:', error);
        }
      }
    }
  }

  // ============================================
  // Board presence ("now on the wall")
  //
  // Keyed on the shared board_id (userBoards.id, resolved from the BLE
  // serial). Membership-free: anyone who has connected to the board can watch
  // its live feed. Mirrors the new-climb domain exactly, plus a per-board
  // monotonic seq and a durable Redis FIFO for late-joiner backfill.
  // ============================================

  /**
   * Subscribe to board-presence events for a shared board.
   * @param boardId stringified userBoards.id
   * @returns Promise that resolves to an unsubscribe function
   */
  async subscribeBoardPresence(boardId: string, callback: BoardPresenceSubscriber): Promise<() => void> {
    this.ensureRedisIfRequired();

    const isFirstSubscriber = !this.boardPresenceSubscribers.has(boardId);

    if (!this.boardPresenceSubscribers.has(boardId)) {
      this.boardPresenceSubscribers.set(boardId, new Set());
    }
    this.boardPresenceSubscribers.get(boardId)!.add(callback);

    if (isFirstSubscriber && this.redisAdapter) {
      try {
        await this.redisAdapter.subscribeBoardPresenceChannel(boardId);
      } catch (error) {
        logger.error(`[PubSub] Failed to subscribe to Redis board presence channel: ${String(error)}`);
        this.boardPresenceSubscribers.get(boardId)?.delete(callback);
        if (this.boardPresenceSubscribers.get(boardId)?.size === 0) {
          this.boardPresenceSubscribers.delete(boardId);
        }
        if (this.redisRequired) {
          throw error;
        }
      }
    }

    return () => {
      this.boardPresenceSubscribers.get(boardId)?.delete(callback);
      if (this.boardPresenceSubscribers.get(boardId)?.size === 0) {
        this.boardPresenceSubscribers.delete(boardId);
        if (this.redisAdapter) {
          this.redisAdapter.unsubscribeBoardPresenceChannel(boardId).catch((error) => {
            logger.error(`[PubSub] Failed to unsubscribe from Redis board presence channel: ${String(error)}`);
          });
        }
      }
    };
  }

  /**
   * Publish a board-presence event to subscribers.
   * Dispatches locally first, then publishes to Redis for other instances.
   */
  publishBoardPresenceEvent(boardId: string, event: BoardPresenceEvent): void {
    this.dispatchToLocalBoardPresenceSubscribers(boardId, event);

    if (this.redisAdapter) {
      this.redisAdapter.publishBoardPresenceEvent(boardId, event).catch((error) => {
        logger.error('[PubSub] Redis board presence publish failed:', error);
      });
    }
  }

  private dispatchToLocalBoardPresenceSubscribers(boardId: string, event: BoardPresenceEvent): void {
    const subscribers = this.boardPresenceSubscribers.get(boardId);
    if (subscribers) {
      for (const callback of subscribers) {
        try {
          callback(event);
        } catch (error) {
          logger.error('Error in board presence subscriber:', error);
        }
      }
    }
  }

  /**
   * Atomically allocate the next monotonic sequence number for a board.
   * Redis `INCR` + `EXPIRE` (pipelined — 1 RTT), cluster-safe across
   * instances; falls back to an in-memory counter in local-only mode.
   *
   * The key expires after a week of inactivity. For a genuinely fresh board
   * that's harmless (INCR restarts at 1 and the empty history buffer expired
   * along with it). For a board dormant *longer* than the TTL whose durable
   * `board_climb_events` rows outlive the key, restarting at 1 would collide
   * with / precede still-existing rows — so whenever INCR comes back small
   * (<= BOARD_SEQ_RESEED_THRESHOLD, the signature of a fresh key either way),
   * `ensureBoardSeqClearOfDurableFloor` checks the durable floor and, if the
   * floor is at or above the INCR result, reseeds atomically past it. The
   * check memoizes per board so a brand-new board's early sends don't repeat
   * the Postgres lookup ~50 times (see that method's safety analysis).
   */
  async nextBoardSeq(boardId: string): Promise<number> {
    if (this.redisAdapter && this.isRedisConnected()) {
      try {
        const { publisher } = redisClientManager.getClients();
        const key = `board:${boardId}:seq`;
        const results = await publisher.pipeline().incr(key).expire(key, BOARD_SEQ_TTL).exec();
        if (!results) {
          throw new Error('nextBoardSeq pipeline returned null');
        }
        const [incrError, incrResult] = results[0];
        if (incrError) throw incrError;
        const next = incrResult as number;

        if (next <= BOARD_SEQ_RESEED_THRESHOLD) {
          return await this.ensureBoardSeqClearOfDurableFloor(boardId, next);
        }

        return next;
      } catch (error) {
        if (this.redisRequired) {
          logger.error('[PubSub] Failed to allocate board seq from required Redis:', error);
          throw error;
        }
        logger.error('[PubSub] Failed to allocate board seq from Redis, falling back to local:', error);
      }
    }

    const next = (this.localBoardSeq.get(boardId) ?? 0) + 1;
    this.localBoardSeq.set(boardId, next);
    return next;
  }

  /**
   * Ensures a small INCR result (<= BOARD_SEQ_RESEED_THRESHOLD) is clear of
   * the durable `board_climb_events` floor, reseeding atomically via
   * `allocateBoardSeqAtLeast` when it isn't. Returns the seq to use. Never
   * throws: a floor-lookup or reseed failure falls back to the INCR result,
   * matching `nextBoardSeq`'s existing non-fatal-degrade contract (and is
   * deliberately NOT memoized, so the very next small INCR retries).
   *
   * Memoization: without it, every send of a brand-new board's first
   * ~BOARD_SEQ_RESEED_THRESHOLD would run the MAX(seq) Postgres lookup. The
   * memo is a per-board watermark = the highest seq this instance has either
   * verified clear of the floor or allocated through this check; the lookup
   * is skipped only when the fresh INCR result is strictly ahead of it
   * (normal early-life counter growth, provably not a reset this instance
   * could collide on). Deliberately NOT the raw floor value: a floor-only
   * memo (e.g. 0 for a new board) would keep skipping after a mid-process
   * counter loss (FLUSHALL / failover to an empty replica) once durable rows
   * exist — INCR restarts at 1, `1 > 0` skips, collision. With the
   * watermark, any allocation pushes it to >= 1, so the first post-reset
   * INCR (= 1) can never be ahead of it and always re-consults the floor.
   *
   * Accepted residual (documented, not defended): in multi-instance, an
   * instance holding a small stale watermark can race another instance's
   * first post-reset reseed and skip the check for a seq the durable floor
   * already covers. The colliding durable insert lands on the (boardId, seq)
   * unique index's `onConflictDoNothing` — one dropped duplicate row, no
   * corruption, and exactly the failure mode every post-dormancy send had
   * before the reseed existed. That needs a mid-process Redis counter loss
   * (not mere dormancy — any send or stats publish re-arms the TTL) plus
   * concurrent sends in the reseed window, so we take the simple memo.
   */
  private async ensureBoardSeqClearOfDurableFloor(boardId: string, incrResult: number): Promise<number> {
    const verifiedThrough = this.boardSeqVerifiedThrough.get(boardId);
    if (verifiedThrough !== undefined && incrResult > verifiedThrough) {
      this.boardSeqVerifiedThrough.set(boardId, incrResult);
      return incrResult;
    }

    let floor: number;
    try {
      floor = await this.boardSeqFloorProvider(Number(boardId));
    } catch (error) {
      logger.error('[PubSub] board seq floor provider failed, using INCR result:', error);
      return incrResult;
    }

    if (floor < incrResult) {
      this.boardSeqVerifiedThrough.set(boardId, Math.max(incrResult, verifiedThrough ?? 0));
      return incrResult;
    }

    try {
      const reseeded = await this.allocateBoardSeqAtLeast(boardId, floor);
      this.boardSeqVerifiedThrough.set(boardId, Math.max(reseeded, verifiedThrough ?? 0));
      return reseeded;
    } catch (error) {
      logger.error('[PubSub] board seq Lua reseed failed, using INCR result:', error);
      return incrResult;
    }
  }

  /**
   * Atomically allocate a board seq value guaranteed to exceed both the
   * current Redis counter and `floor` (`max(currentValue, floor) + 1`),
   * re-arming the TTL. A single Lua script keeps the read-compare-write
   * atomic under concurrent callers — two racing reseeds still get distinct,
   * monotonic results because Redis serializes the script execution.
   * Redis-only; callers must already know Redis is connected (internal reseed
   * path checks this; the method is also exported for direct unit testing).
   */
  async allocateBoardSeqAtLeast(boardId: string, floor: number): Promise<number> {
    const { publisher } = redisClientManager.getClients();
    const key = `board:${boardId}:seq`;
    const result = await publisher.eval(
      "local cur = tonumber(redis.call('get', KEYS[1]) or '0'); " +
        'local nxt = math.max(cur, tonumber(ARGV[1])) + 1; ' +
        "redis.call('set', KEYS[1], nxt); " +
        "redis.call('expire', KEYS[1], ARGV[2]); " +
        'return nxt',
      1,
      key,
      floor,
      BOARD_SEQ_TTL,
    );
    return Number(result);
  }

  /**
   * Read a board's recent climbs, newest-first by seq (cap 50). Empty without
   * Redis.
   */
  async getRecentBoardClimbs(boardId: string): Promise<BoardPresenceClimb[]> {
    if (!this.redisAdapter || !this.isRedisConnected()) {
      return [];
    }

    try {
      const { publisher } = redisClientManager.getClients();
      const key = `board:${boardId}:history`;
      const entries = await publisher.lrange(key, 0, -1);

      const climbs: BoardPresenceClimb[] = [];
      for (const json of entries) {
        try {
          climbs.push(JSON.parse(json) as BoardPresenceClimb);
        } catch (parseError) {
          logger.error('[PubSub] Failed to parse board history entry:', parseError);
        }
      }

      // The list is already newest-first (lpush), but sort by seq DESC so a
      // late, out-of-order write can't surface above a newer climb.
      climbs.sort((a, b) => b.seq - a.seq);
      return climbs.slice(0, BOARD_HISTORY_SIZE);
    } catch (error) {
      logger.error('[PubSub] Failed to read board history:', error);
      return [];
    }
  }

  /**
   * Record that a user is connected to a board (proof-of-presence), stamped on
   * resolveBoardForSerial / resolveBoardForConfig. `reportBoardClimb` requires
   * this so a logged-in user can't inject onto a board they never connected to.
   * TTL'd; a reconnect re-stamps. Best-effort without Redis (local map).
   */
  async stampBoardMembership(boardId: string, userId: string): Promise<void> {
    const key = `presence:board:${boardId}:user:${userId}`;
    if (this.redisAdapter && this.isRedisConnected()) {
      try {
        const { publisher } = redisClientManager.getClients();
        // Store the first-seen epoch-ms (NX preserves it across reconnects) so
        // the durable-history dwell gate can tell how long this member has been
        // on the board. A separate EXPIRE keeps the key alive while they're
        // active without resetting first-seen. EXISTS still answers presence.
        await publisher.set(key, String(Date.now()), 'EX', BOARD_MEMBERSHIP_TTL, 'NX');
        await publisher.expire(key, BOARD_MEMBERSHIP_TTL);
        return;
      } catch (error) {
        if (this.redisRequired) {
          logger.error('[PubSub] Failed to stamp board membership in required Redis:', error);
          throw error;
        }
        logger.error('[PubSub] Failed to stamp board membership, falling back to local:', error);
      }
    }
    this.setLocalBoardMembership(`${boardId}:${userId}`, Date.now() + BOARD_MEMBERSHIP_TTL * 1000);
  }

  /** True if the user has a live proof-of-presence stamp for the board. */
  async hasBoardMembership(boardId: string, userId: string): Promise<boolean> {
    const key = `presence:board:${boardId}:user:${userId}`;
    if (this.redisAdapter && this.isRedisConnected()) {
      try {
        const { publisher } = redisClientManager.getClients();
        return (await publisher.exists(key)) === 1;
      } catch (error) {
        if (this.redisRequired) {
          logger.error('[PubSub] Failed to check board membership in required Redis:', error);
          throw error;
        }
        logger.error('[PubSub] Failed to check board membership, falling back to local:', error);
      }
    }
    return this.checkLocalBoardMembership(boardId, userId);
  }

  private checkLocalBoardMembership(boardId: string, userId: string): boolean {
    const localKey = `${boardId}:${userId}`;
    const expiry = this.localBoardMembership.get(localKey);
    if (expiry === undefined) return false;
    if (expiry <= Date.now()) {
      this.localBoardMembership.delete(localKey);
      return false;
    }
    return true;
  }

  /**
   * One Redis pipeline (1 RTT) that answers everything `reportBoardClimb`'s
   * Stage A needs before validating the incoming climb: proof-of-presence
   * (+ first-seen, for the durable-history dwell gate), the last-report dedup
   * marker (for write-side idempotency, A2), and the current writer (so the
   * dedup short-circuit can require the retrying emitter to still hold the
   * wall — see `BoardReportGate.currentWriter`). Replaces what used to be
   * separate `hasBoardMembership` + first-seen + `lastReport` reads — 3 RTTs
   * collapsed into 1, with the writer read riding the same pipeline for free.
   *
   * Preserves `hasBoardMembership`'s fail-closed `redisRequired` semantics
   * (throws when Redis is required but the pipeline fails) and the
   * plausible-epoch guard on `firstSeenMs` (a legacy/implausible stamp still
   * counts as a member but never satisfies the dwell gate). Local-only
   * fallback mirrors today: membership from the in-memory map,
   * `firstSeenMs`/`lastReport`/`currentWriter` unknown (null) — durable
   * history and write-side dedup both degrade to off without Redis, same as
   * before.
   */
  async getBoardReportGate(boardId: string, emitterId: string): Promise<BoardReportGate> {
    const membershipKey = `presence:board:${boardId}:user:${emitterId}`;
    const lastReportKey = `board:${boardId}:lastReport`;
    const writerKey = `board:${boardId}:writer`;

    if (this.redisAdapter && this.isRedisConnected()) {
      try {
        const { publisher } = redisClientManager.getClients();
        const results = await publisher.pipeline().get(membershipKey).get(lastReportKey).get(writerKey).exec();
        if (!results) {
          throw new Error('getBoardReportGate pipeline returned null');
        }
        const [[membershipError, membershipRaw], [lastReportError, lastReportRaw], [writerError, writerRaw]] = results;
        if (membershipError) throw membershipError;
        if (lastReportError) throw lastReportError;
        if (writerError) throw writerError;
        const raw = membershipRaw as string | null;
        return {
          isMember: raw !== null,
          firstSeenMs: parsePlausibleFirstSeenMs(raw),
          lastReport: (lastReportRaw as string | null) ?? null,
          currentWriter: (writerRaw as string | null) ?? null,
        };
      } catch (error) {
        if (this.redisRequired) {
          logger.error('[PubSub] Failed to read board report gate from required Redis:', error);
          throw error;
        }
        logger.error('[PubSub] Failed to read board report gate, falling back to local:', error);
      }
    }

    return {
      isMember: this.checkLocalBoardMembership(boardId, emitterId),
      firstSeenMs: null,
      lastReport: null,
      currentWriter: null,
    };
  }

  /**
   * One Redis pipeline (1 RTT) that commits an accepted `reportBoardClimb`
   * send: appends to the durable FIFO history (LPUSH/LTRIM/EXPIRE), takes the
   * connection-holder slot (atomic `SET writer EX GET` — a single command, so
   * two concurrent reports still can't both observe the same previous
   * holder), stamps the write-side dedup marker (A2's `lastReport`), and —
   * when this connection is in a party session — remembers the session→board
   * mapping (`session:{id}:board`). Replaces what used to be 3 separate
   * round trips.
   *
   * Non-fatal: the whole pipeline (or an individual command within it) can
   * fail without failing the accepted report — failures are logged and
   * swallowed. But a swallowed failure means `previousWriter: null` is a
   * fabrication, not an observation, so the result also carries
   * `writerSlotOk`: false whenever the writer slot didn't verifiably execute
   * (Redis off, pipeline threw, or the SET..GET slot itself errored). The
   * resolver gates the hand-off broadcast on it — without that gate, a
   * failing pipeline would look like "board was free" on every send and
   * spuriously re-broadcast the hand-off each time (the pre-pipeline code
   * never had this failure mode: a writer-update failure was either swallowed
   * with no broadcast, or thrown in redisRequired mode).
   */
  async commitBoardClimb(input: CommitBoardClimbInput): Promise<CommitBoardClimbResult> {
    if (!this.redisAdapter || !this.isRedisConnected()) {
      return { previousWriter: null, writerSlotOk: false };
    }

    try {
      const { publisher } = redisClientManager.getClients();
      const historyKey = `board:${input.boardId}:history`;
      const writerKey = `board:${input.boardId}:writer`;
      const lastReportKey = `board:${input.boardId}:lastReport`;
      const lastReportValue = `${input.emitterId}|${input.climbUuid}|${input.effectiveAngle}`;

      const pipeline = publisher.pipeline();
      const commandLabels: string[] = [];
      pipeline.lpush(historyKey, JSON.stringify(input.climb));
      commandLabels.push('history-lpush');
      pipeline.ltrim(historyKey, 0, BOARD_HISTORY_SIZE - 1);
      commandLabels.push('history-ltrim');
      pipeline.expire(historyKey, BOARD_HISTORY_TTL);
      commandLabels.push('history-expire');
      const writerCommandIndex = commandLabels.length;
      pipeline.set(writerKey, input.emitterId, 'EX', BOARD_MEMBERSHIP_TTL, 'GET');
      commandLabels.push('writer-set');
      pipeline.set(lastReportKey, lastReportValue, 'PX', REPORT_DEDUP_WINDOW_MS);
      commandLabels.push('last-report-set');
      if (input.sessionId) {
        pipeline.set(`session:${input.sessionId}:board`, input.boardId, 'EX', BOARD_MEMBERSHIP_TTL);
        commandLabels.push('session-board-set');
      }

      const results = await pipeline.exec();
      if (!results) {
        throw new Error('commitBoardClimb pipeline returned null');
      }

      results.forEach(([error], index) => {
        if (error) {
          logger.warn(`[PubSub] commitBoardClimb ${commandLabels[index]} command failed: ${String(error)}`);
        }
      });

      const [writerError, writerValue] = results[writerCommandIndex];
      if (writerError) return { previousWriter: null, writerSlotOk: false };
      return { previousWriter: (writerValue as string | null) ?? null, writerSlotOk: true };
    } catch (error) {
      logger.error('[PubSub] commitBoardClimb pipeline failed:', error);
      return { previousWriter: null, writerSlotOk: false };
    }
  }

  /**
   * Clear the board's holder only if `emitterId` still holds it (atomic
   * compare-and-delete), so a holder who was already booted can't wipe the new
   * one. Returns whether it was actually cleared.
   */
  async clearBoardWriterIf(boardId: string, emitterId: string): Promise<boolean> {
    if (!this.redisAdapter || !this.isRedisConnected()) return false;
    try {
      const { publisher } = redisClientManager.getClients();
      const cleared = await publisher.eval(
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
        1,
        `board:${boardId}:writer`,
        emitterId,
      );
      return cleared === 1;
    } catch (error) {
      if (this.redisRequired) throw error;
      logger.error('[PubSub] Failed to clear board writer:', error);
      return false;
    }
  }

  /** The board's current connection holder emitter id, or null when free. */
  async getBoardWriter(boardId: string): Promise<string | null> {
    if (!this.redisAdapter || !this.isRedisConnected()) return null;
    try {
      const { publisher } = redisClientManager.getClients();
      return await publisher.get(`board:${boardId}:writer`);
    } catch (error) {
      if (this.redisRequired) throw error;
      logger.error('[PubSub] Failed to get board writer:', error);
      return null;
    }
  }

  /**
   * The shared board_id this party session is on, or null when unknown.
   *
   * The mapping (`session:{id}:board`) is written by `commitBoardClimb` as a
   * side-effect of `reportBoardClimb` — the only moment a session is provably
   * tied to a board. The APNs Live Activity path reads it to resolve the
   * board's current holder for a given session (`QueueState` and the
   * push-token rows carry sessionId but not boardId). Redis-only and TTL'd to
   * the same window as proof-of-presence so an idle session's mapping doesn't
   * leak; a fresh send re-stamps it. Without Redis the holder lookup degrades
   * to "unknown" and the APNs path omits boardConnection (device falls back
   * to its own App-Group state).
   */
  async getSessionBoard(sessionId: string): Promise<string | null> {
    if (!this.redisAdapter || !this.isRedisConnected()) return null;
    try {
      const { publisher } = redisClientManager.getClients();
      return await publisher.get(`session:${sessionId}:board`);
    } catch (error) {
      if (this.redisRequired) throw error;
      logger.error('[PubSub] Failed to get session board:', error);
      return null;
    }
  }

  private setLocalBoardMembership(localKey: string, expiry: number): void {
    this.localBoardMembership.set(localKey, expiry);
    if (this.localBoardMembershipCleanupExpiry !== null && expiry >= this.localBoardMembershipCleanupExpiry) {
      return;
    }
    this.scheduleLocalBoardMembershipCleanup();
  }

  /** @internal Test hook for local-only proof-of-presence cleanup coverage. */
  resetLocalBoardMembershipForTest(): void {
    this.clearLocalBoardMembershipCleanupTimer();
    this.localBoardMembership.clear();
  }

  /** @internal Test hook for local-only proof-of-presence cleanup coverage. */
  setLocalBoardMembershipForTest(localKey: string, expiry: number): void {
    this.setLocalBoardMembership(localKey, expiry);
  }

  /** @internal Test hook for local-only proof-of-presence cleanup coverage. */
  hasLocalBoardMembershipForTest(localKey: string): boolean {
    return this.localBoardMembership.has(localKey);
  }

  private scheduleLocalBoardMembershipCleanup(): void {
    this.clearLocalBoardMembershipCleanupTimer();

    if (this.localBoardMembership.size === 0) {
      return;
    }

    // Local-only mode is single-process and expected to stay small; keep the
    // scheduler simple unless proof-of-presence cardinality becomes material.
    let nextExpiry: number | null = null;
    for (const expiry of this.localBoardMembership.values()) {
      nextExpiry = nextExpiry === null ? expiry : Math.min(nextExpiry, expiry);
    }
    if (nextExpiry === null) return;

    this.localBoardMembershipCleanupExpiry = nextExpiry;
    const cleanupDelay = Math.max(0, nextExpiry - Date.now());
    const cleanupTimer = setTimeout(() => {
      this.localBoardMembershipCleanupTimer = null;
      this.localBoardMembershipCleanupExpiry = null;
      this.evictExpiredLocalBoardMemberships();
      this.scheduleLocalBoardMembershipCleanup();
    }, cleanupDelay);
    this.localBoardMembershipCleanupTimer = cleanupTimer;
    if (typeof cleanupTimer === 'object') {
      cleanupTimer.unref?.();
    }
  }

  private clearLocalBoardMembershipCleanupTimer(): void {
    if (this.localBoardMembershipCleanupTimer === null) {
      return;
    }
    clearTimeout(this.localBoardMembershipCleanupTimer);
    this.localBoardMembershipCleanupTimer = null;
    this.localBoardMembershipCleanupExpiry = null;
  }

  private evictExpiredLocalBoardMemberships(now = Date.now()): void {
    for (const [localKey, expiry] of this.localBoardMembership) {
      if (expiry <= now) {
        this.localBoardMembership.delete(localKey);
      }
    }
  }

  /**
   * Ensure Redis is connected if it's required.
   * @throws If Redis is required but not connected
   */
  private ensureRedisIfRequired(): void {
    if (this.redisRequired && !this.isRedisConnected()) {
      throw new Error('Redis is required but not connected');
    }
  }

  /**
   * Get count of subscribers for debugging
   */
  getSubscriberCounts(sessionId: string): { queue: number; session: number } {
    return {
      queue: this.queueSubscribers.get(sessionId)?.size ?? 0,
      session: this.sessionSubscribers.get(sessionId)?.size ?? 0,
    };
  }
}

export const pubsub = new PubSub();
