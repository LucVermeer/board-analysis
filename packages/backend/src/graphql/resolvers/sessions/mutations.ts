import { v4 as uuidv4 } from 'uuid';
import type { ConnectionContext, SessionEvent, ClimbQueueItem } from '@boardsesh/shared-schema';
import { roomManager } from '../../../services/room-manager';
import { pubsub } from '../../../pubsub/index';
import { updateContext } from '../../context';
import { requireAuthenticated, requireSessionMember, applyRateLimit, validateInput } from '../shared/helpers';
import {
  SessionIdSchema,
  ParticipantIdSchema,
  BoardPathSchema,
  UsernameSchema,
  AvatarUrlSchema,
  SessionNameSchema,
  CreateSessionInputSchema,
  ClimbQueueItemSchema,
  QueueArraySchema,
} from '../../../validation/schemas';
import type { CreateSessionInput } from '../shared/types';
import { db } from '../../../db/client';
import { esp32Controllers, userBoards } from '@boardsesh/db/schema/app';
import { sessionBoards } from '../../../db/schema';
import { eq, inArray } from 'drizzle-orm';
import { generateSessionSummary } from './session-summary';
import { adoptRecentTicksForSession, extractBoardType } from '../../../jobs/inferred-session-builder';

/**
 * Auto-authorize all controllers owned by a user for a session.
 * Called when user joins a session to allow their ESP32 devices to connect.
 */
async function authorizeUserControllersForSession(userId: string, sessionId: string): Promise<void> {
  try {
    // Update all controllers owned by this user to be authorized for this session
    await db
      .update(esp32Controllers)
      .set({ authorizedSessionId: sessionId })
      .where(eq(esp32Controllers.userId, userId));

    console.info(`[Session] Auto-authorized user ${userId}'s controllers for session ${sessionId}`);
  } catch (error) {
    // Log but don't fail the join - controller auth is a bonus feature
    console.error('[Session] Failed to auto-authorize controllers:', error);
  }
}

// Debug logging flag - only log in development
const DEBUG = process.env.NODE_ENV === 'development';

export const sessionMutations = {
  /**
   * Join an existing session or create a new one
   * Creates or joins a session and updates connection context.
   * When creating a new session, initialQueue and initialCurrentClimb can be provided
   * to seed the session with existing queue items (e.g., when starting party mode with an existing local queue).
   * sessionName is only used when creating a new session - ignored when joining an existing one.
   */
  joinSession: async (
    _: unknown,
    {
      sessionId,
      boardPath,
      username,
      avatarUrl,
      participantId,
      initialQueue,
      initialCurrentClimb,
      sessionName,
    }: {
      sessionId: string;
      boardPath: string;
      username?: string;
      avatarUrl?: string;
      participantId?: string;
      initialQueue?: ClimbQueueItem[];
      initialCurrentClimb?: ClimbQueueItem;
      sessionName?: string;
    },
    ctx: ConnectionContext,
  ) => {
    if (DEBUG)
      console.info(
        `[joinSession] START - connectionId: ${ctx.connectionId}, sessionId: ${sessionId}, username: ${username}, sessionName: ${sessionName}, initialQueueLength: ${initialQueue?.length || 0}`,
      );

    await applyRateLimit(ctx, 10); // Limit session joins to prevent abuse

    // Validate inputs
    validateInput(SessionIdSchema, sessionId, 'sessionId');
    validateInput(BoardPathSchema, boardPath, 'boardPath');
    if (username) validateInput(UsernameSchema, username, 'username');
    if (avatarUrl) validateInput(AvatarUrlSchema, avatarUrl, 'avatarUrl');
    if (participantId) validateInput(ParticipantIdSchema, participantId, 'participantId');
    if (sessionName) validateInput(SessionNameSchema, sessionName, 'sessionName');
    if (initialQueue) validateInput(QueueArraySchema, initialQueue, 'initialQueue');
    if (initialCurrentClimb) validateInput(ClimbQueueItemSchema, initialCurrentClimb, 'initialCurrentClimb');

    const result = await roomManager.joinSession(
      ctx.connectionId,
      sessionId,
      boardPath,
      username || undefined,
      avatarUrl || undefined,
      initialQueue,
      initialCurrentClimb || null,
      sessionName || undefined,
      participantId || undefined,
    );
    if (DEBUG)
      console.info(
        `[joinSession] roomManager.joinSession completed - clientId: ${result.clientId}, isLeader: ${result.isLeader}`,
      );

    // Update context with session info. Do NOT touch userId here — auth
    // middleware set it to the real authenticated user UUID when the WS
    // connected. `result.clientId` is the connection ID (see
    // services/room-manager/client-lifecycle.ts:199 which returns
    // `clientId: connectionId`), and writing it to `ctx.userId` would
    // clobber the real UUID for every downstream resolver on this connection
    // (ESP32 auto-authorize, tick inserts, climb ownership, etc.).
    if (DEBUG) console.info(`[joinSession] Before updateContext - ctx.sessionId: ${ctx.sessionId}`);
    updateContext(ctx.connectionId, { sessionId, participantId: result.participantId });
    if (DEBUG) console.info(`[joinSession] After updateContext - ctx.sessionId: ${ctx.sessionId}`);

    // Auto-authorize user's ESP32 controllers for this session (if authenticated)
    if (ctx.isAuthenticated && ctx.userId) {
      void authorizeUserControllersForSession(ctx.userId, sessionId);
      // Adopt recent solo ticks into this session. The session row exists at
      // this point (ensureSessionRecordExists ran inside roomManager.joinSession).
      const boardTypeFromPath = extractBoardType(boardPath);
      adoptRecentTicksForSession(ctx.userId, sessionId, boardTypeFromPath).catch((err) => {
        console.error(`[joinSession] Failed to adopt recent ticks for session ${sessionId}:`, err);
      });
    }

    // Notify session about new or reconnected participant
    const sessionUser = result.users.find((user) => user.id === result.participantId) ?? {
      id: result.participantId,
      username: username || `User-${result.participantId.substring(0, 6)}`,
      isLeader: result.isLeader,
      avatarUrl: avatarUrl,
      userId: ctx.isAuthenticated ? ctx.userId : null,
      connectionState: 'CONNECTED' as const,
    };
    const sessionEvent: SessionEvent = result.participantWasReconnecting
      ? { __typename: 'UserPresenceChanged', user: sessionUser }
      : { __typename: 'UserJoined', user: sessionUser };
    pubsub.publishSessionEvent(sessionId, sessionEvent);

    // Fetch session data for new fields
    const sessionData = await roomManager.getSessionById(sessionId);

    return {
      id: sessionId,
      name: result.sessionName || null,
      boardPath,
      users: result.users,
      queueState: {
        sequence: result.sequence,
        stateHash: result.stateHash,
        queue: result.queue,
        currentClimbQueueItem: result.currentClimbQueueItem,
      },
      isLeader: result.isLeader,
      clientId: result.clientId,
      goal: sessionData?.goal || null,
      isPublic: sessionData?.isPublic ?? true,
      startedAt: sessionData?.startedAt?.toISOString() || null,
      endedAt: sessionData?.endedAt?.toISOString() || null,
      isPermanent: sessionData?.isPermanent ?? false,
      color: sessionData?.color || null,
    };
  },

  /**
   * Create a new session
   * Only authenticated users can create sessions
   * Optionally creates a discoverable session with GPS coordinates
   */
  createSession: async (_: unknown, { input }: { input: CreateSessionInput }, ctx: ConnectionContext) => {
    if (DEBUG) console.info(`[createSession] START - connectionId: ${ctx.connectionId}, boardPath: ${input.boardPath}`);

    await applyRateLimit(ctx, 5); // Limit session creation to prevent abuse

    // Validate input
    validateInput(CreateSessionInputSchema, input, 'createSession input');

    // Generate a unique session ID
    const sessionId = uuidv4();
    if (DEBUG) console.info(`[createSession] Generated sessionId: ${sessionId}`);

    if (input.discoverable) {
      // Discoverable sessions require authentication (they write to DB with userId)
      requireAuthenticated(ctx);
      // Use authenticated userId from context
      const userId = ctx.userId || ctx.connectionId;
      await roomManager.createDiscoverableSession(
        sessionId,
        input.boardPath,
        userId,
        input.latitude,
        input.longitude,
        input.name,
        input.goal,
        input.isPermanent,
        input.color,
      );

      // If boardIds provided, create sessionBoards junction rows
      if (input.boardIds && input.boardIds.length > 0) {
        // Verify boards exist
        const boards = await db
          .select({ id: userBoards.id, gymId: userBoards.gymId })
          .from(userBoards)
          .where(inArray(userBoards.id, input.boardIds));

        if (boards.length !== input.boardIds.length) {
          throw new Error('One or more board IDs do not exist');
        }

        // Validate all boards share the same gym (multi-board requires same gym)
        const gymIds = new Set(boards.map((b) => b.gymId).filter(Boolean));
        if (gymIds.size > 1) {
          throw new Error('All boards must belong to the same gym for multi-board sessions');
        }

        // Insert junction rows
        await db.insert(sessionBoards).values(
          input.boardIds.map((boardId) => ({
            sessionId,
            boardId,
          })),
        );
      }
    }

    // For HTTP requests (stateless), skip joining the session in-memory.
    // The creator will join via WebSocket when they navigate to the board page.
    const isHttpRequest = ctx.connectionId.startsWith('http-');

    if (!isHttpRequest) {
      // WebSocket path: join the session as the creator.
      // For non-discoverable sessions, this also creates the board_sessions row
      // via ensureSessionRecordExists inside roomManager.joinSession.
      const result = await roomManager.joinSession(
        ctx.connectionId,
        sessionId,
        input.boardPath,
        undefined, // username will be set later
        undefined, // avatarUrl will be set later
        undefined, // initialQueue
        null, // initialCurrentClimb
        input.discoverable ? undefined : input.name,
      );
      if (DEBUG)
        console.info(`[createSession] Joined session - clientId: ${result.clientId}, isLeader: ${result.isLeader}`);

      updateContext(ctx.connectionId, { sessionId, participantId: result.participantId });

      // Adopt recent solo ticks now that the session row exists in board_sessions
      // (boardsesh_ticks.session_id is a FK to board_sessions.id)
      if (ctx.isAuthenticated && ctx.userId) {
        const boardTypeFromPath = extractBoardType(input.boardPath);
        adoptRecentTicksForSession(ctx.userId, sessionId, boardTypeFromPath).catch((err) => {
          console.error(`[createSession] Failed to adopt recent ticks for session ${sessionId}:`, err);
        });
      }

      return {
        id: sessionId,
        name: input.name || null,
        boardPath: input.boardPath,
        users: result.users,
        queueState: {
          sequence: result.sequence,
          stateHash: result.stateHash,
          queue: result.queue,
          currentClimbQueueItem: result.currentClimbQueueItem,
        },
        isLeader: result.isLeader,
        clientId: result.clientId,
        goal: input.goal || null,
        isPublic: true,
        startedAt: new Date().toISOString(),
        endedAt: null,
        isPermanent: input.isPermanent || false,
        color: input.color || null,
      };
    }

    // HTTP path: adoption is handled by joinSession when the client connects
    // via WebSocket (avoids double invocation for HTTP + discoverable sessions).

    // HTTP path: return session metadata only; client joins via WebSocket later
    if (DEBUG) console.info(`[createSession] HTTP request - returning session metadata without joining`);

    return {
      id: sessionId,
      name: input.name || null,
      boardPath: input.boardPath,
      users: [],
      queueState: null,
      isLeader: false,
      clientId: null,
      goal: input.goal || null,
      isPublic: true,
      startedAt: new Date().toISOString(),
      endedAt: null,
      isPermanent: input.isPermanent || false,
      color: input.color || null,
    };
  },

  /**
   * Leave the current session
   * Cleans up connection context and notifies other session members
   */
  leaveSession: async (_: unknown, __: unknown, ctx: ConnectionContext) => {
    if (!ctx.sessionId) return false;

    const sessionId = ctx.sessionId;
    const participantId = ctx.participantId;
    const result = await roomManager.leaveSession(ctx.connectionId);

    if (result) {
      // Notify session about the stable participant leaving. The schema field
      // is named `userId` for historical reasons, but current clients compare
      // it with `SessionUser.id`, which is the stable participant ID.
      pubsub.publishSessionEvent(sessionId, {
        __typename: 'UserLeft',
        userId: result.participantId || participantId || ctx.connectionId,
      });

      // Notify about new leader if changed
      if (result.newLeaderId) {
        pubsub.publishSessionEvent(sessionId, {
          __typename: 'LeaderChanged',
          leaderId: result.newLeaderId,
        });
      }

      // Only clear session/participant state. Auth set userId to the real
      // UUID at connection time and downstream resolvers on this same
      // WebSocket still need it.
      updateContext(ctx.connectionId, { sessionId: undefined, participantId: undefined });
    }

    return true;
  },

  /**
   * End a session explicitly.
   * Validates the caller is an active participant.
   * Returns a session summary with stats, or null if no ticks.
   */
  endSession: async (_: unknown, { sessionId }: { sessionId: string }, ctx: ConnectionContext) => {
    await applyRateLimit(ctx, 5);
    validateInput(SessionIdSchema, sessionId, 'sessionId');

    const sessionData = await roomManager.getSessionById(sessionId);
    if (!sessionData) {
      throw new Error('Session not found');
    }

    if (ctx.connectionId.startsWith('http-')) {
      requireAuthenticated(ctx);
      if (!sessionData.createdByUserId || sessionData.createdByUserId !== ctx.userId) {
        throw new Error('Only the session creator can end this session over HTTP');
      }
    } else {
      await requireSessionMember(ctx, sessionId);
      const sessionUsers = await roomManager.getSessionUsers(sessionId);
      const actorId = ctx.participantId || ctx.userId || ctx.connectionId;
      const actor = sessionUsers.find(
        (user) => user.id === actorId || (ctx.userId ? user.userId === ctx.userId : false),
      );
      const isCreator = !!ctx.userId && sessionData.createdByUserId === ctx.userId;
      if (!isCreator && !actor?.isLeader) {
        throw new Error('Only the session creator or current leader can end this session');
      }
    }

    // End the session via room manager
    await roomManager.endSession(sessionId);

    // Publish SessionEnded event so all connected clients are notified
    const sessionEndedEvent: SessionEvent = {
      __typename: 'SessionEnded',
      reason: 'Session ended by participant',
    };
    pubsub.publishSessionEvent(sessionId, sessionEndedEvent);

    // Generate and return summary
    const summary = await generateSessionSummary(sessionId);
    return summary;
  },

  /**
   * Update username and avatar for the current user in the session
   * Re-announces the user to all session members
   */
  updateUsername: async (
    _: unknown,
    { username, avatarUrl }: { username: string; avatarUrl?: string },
    ctx: ConnectionContext,
  ) => {
    // Validate inputs
    validateInput(UsernameSchema, username, 'username');
    if (avatarUrl) validateInput(AvatarUrlSchema, avatarUrl, 'avatarUrl');

    await roomManager.updateUsername(ctx.connectionId, username, avatarUrl);

    if (ctx.sessionId) {
      const client = roomManager.getClient(ctx.connectionId);
      if (client) {
        // Re-announce user with updated info
        pubsub.publishSessionEvent(ctx.sessionId, {
          __typename: 'UserJoined',
          user: {
            id: client.participantId || client.connectionId,
            username,
            isLeader: client.isLeader,
            avatarUrl: client.avatarUrl,
            userId: client.userId,
            connectionState: 'CONNECTED',
          },
        });
      }
    }

    return true;
  },
};
