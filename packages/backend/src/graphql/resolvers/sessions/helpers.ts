import type { ConnectionContext, ClimbQueueItem, SessionUser } from '@boardsesh/shared-schema';
import { roomManager } from '../../../services/room-manager';
import type { Session as SessionDbRow } from '../../../db/schema';

/**
 * The trimmed `queueState` shape that every Session-returning resolver
 * embeds. Matches the GraphQL `QueueState` type; deliberately omits the
 * RoomManager-internal `version` field which never flows to the wire.
 */
type SessionQueueState = {
  sequence: number;
  stateHash: string;
  queue: ClimbQueueItem[];
  currentClimbQueueItem: ClimbQueueItem | null;
};

/**
 * Optional pre-resolved values that callers pass in to skip the helper's
 * internal Redis lookups. Used when the resolver already knows a field —
 * `joinSession` has fresh `users`/`queueState`/`name`; `takeControl` knows
 * the driver it just wrote; `releaseControl` knows `null` after a successful
 * clear.
 *
 * Convention: an explicit `null` (or any value) is a real override and skips
 * the fetch. `undefined` (or key absent) triggers the fetch. So pre-resolved
 * but legitimately-null values like `driverParticipantId: null` from
 * `releaseControl` are honoured, while `name: undefined` still defers to
 * `sessionData.name`.
 */
export type SessionPayloadInputs = {
  users?: SessionUser[];
  queueState?: SessionQueueState;
  sessionData?: SessionDbRow | null;
  driverParticipantId?: string | null;
  lastConnectedBoardSerial?: string | null;
  leaderConnectionId?: string | null;
  name?: string | null;
  boardPath?: string;
  isLeader?: boolean;
  clientId?: string | null;
  participantId?: string;
};

/**
 * Build the 16-field Session GraphQL payload, fanning the four-to-six
 * independent Redis reads into a single `Promise.all`. Replaces the verbatim
 * `id`/`name`/`boardPath`/`users`/`queueState`/`isLeader`/...-shaped return
 * objects in every Session-returning resolver. Pass `inputs.X` to short-
 * circuit a specific lookup when the caller already has the value.
 */
export async function buildSessionPayload(
  sessionId: string,
  ctx: ConnectionContext,
  inputs: SessionPayloadInputs = {},
) {
  const [users, queueState, sessionData, driverParticipantId, lastConnectedBoardSerial, leaderConnectionId] =
    await Promise.all([
      inputs.users !== undefined ? Promise.resolve(inputs.users) : roomManager.getSessionUsers(sessionId),
      inputs.queueState !== undefined ? Promise.resolve(inputs.queueState) : roomManager.getQueueState(sessionId),
      inputs.sessionData !== undefined ? Promise.resolve(inputs.sessionData) : roomManager.getSessionById(sessionId),
      inputs.driverParticipantId !== undefined
        ? Promise.resolve(inputs.driverParticipantId)
        : roomManager.getSessionDriverParticipantId(sessionId),
      inputs.lastConnectedBoardSerial !== undefined
        ? Promise.resolve(inputs.lastConnectedBoardSerial)
        : roomManager.getSessionBoardSerial(sessionId),
      inputs.leaderConnectionId !== undefined
        ? Promise.resolve(inputs.leaderConnectionId)
        : roomManager.getSessionLeaderConnectionId(sessionId),
    ]);

  return {
    id: sessionId,
    name: inputs.name !== undefined ? inputs.name : (sessionData?.name ?? null),
    boardPath: inputs.boardPath !== undefined ? inputs.boardPath : (sessionData?.boardPath ?? ''),
    users,
    queueState: {
      sequence: queueState.sequence,
      stateHash: queueState.stateHash,
      queue: queueState.queue,
      currentClimbQueueItem: queueState.currentClimbQueueItem,
    },
    isLeader: inputs.isLeader !== undefined ? inputs.isLeader : leaderConnectionId === ctx.connectionId,
    driverParticipantId,
    lastConnectedBoardSerial,
    clientId: inputs.clientId !== undefined ? inputs.clientId : ctx.connectionId,
    participantId: inputs.participantId ?? ctx.participantId ?? ctx.connectionId ?? '',
    goal: sessionData?.goal || null,
    isPublic: sessionData?.isPublic ?? true,
    startedAt: sessionData?.startedAt?.toISOString() || null,
    endedAt: sessionData?.endedAt?.toISOString() || null,
    isPermanent: sessionData?.isPermanent ?? false,
    color: sessionData?.color || null,
  };
}
