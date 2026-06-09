import { v4 as uuidv4 } from 'uuid';
import { and, eq, isNull } from 'drizzle-orm';
import { GraphQLError } from 'graphql';
import type {
  ConnectionContext,
  ClimbQueueItemInput,
  ResolvedBoard,
  BoardPresenceClimb,
} from '@boardsesh/shared-schema';
import { db } from '../../../db/client';
import * as dbSchema from '@boardsesh/db/schema';
import { requireAuthenticated, applyRateLimit, validateInput } from '../shared/helpers';
import { BoardNameSchema, BoardSerialSchema } from '../../../validation/schemas/primitives';
import { resolveBoardFromPath, generateUniqueSlug } from '../social/boards';
import { logger } from '../../../utils/logger';
import { pubsub } from '../../../pubsub/index';
import { requireBoardPresenceEnabled, assertValidBoardId } from './shared';

// Human-friendly default names for an auto-created board. Falls back to the
// raw board type when we don't recognise it.
const BOARD_TYPE_LABELS: Record<string, string> = {
  kilter: 'Kilter',
  tension: 'Tension',
  moonboard: 'MoonBoard',
  decoy: 'Decoy',
  touchstone: 'Touchstone',
  grasshopper: 'Grasshopper',
  soill: 'So iLL',
};

function defaultBoardName(boardType: string): string {
  return `${BOARD_TYPE_LABELS[boardType] ?? boardType} Board`;
}

/** Look up an active board sharing this serial (the shared physical wall). */
async function findActiveBoardBySerial(serial: string): Promise<typeof dbSchema.userBoards.$inferSelect | undefined> {
  const [board] = await db
    .select()
    .from(dbSchema.userBoards)
    .where(and(eq(dbSchema.userBoards.serialNumber, serial), isNull(dbSchema.userBoards.deletedAt)))
    .limit(1);
  return board;
}

function toResolvedBoard(board: typeof dbSchema.userBoards.$inferSelect): ResolvedBoard {
  return {
    boardId: Number(board.id),
    boardName: board.name,
    boardType: board.boardType,
    layoutId: Number(board.layoutId),
    sizeId: Number(board.sizeId),
    setIds: board.setIds,
  };
}

export const boardPresenceMutations = {
  /**
   * Resolve (and bind) the shared board for a BLE serial. Find-or-creates so
   * everyone at the same physical wall converges on a single board_id:
   *   (a) a board already bound to this serial → return it (the shared board);
   *   (b) else the caller's own board for this config → stamp the serial onto it;
   *   (c) else create a fresh board owned by the caller, bound to the serial.
   * Enforces serial → exactly one board via the unique partial index; the
   * insert race is resolved by re-reading the winner.
   */
  resolveBoardForSerial: async (
    _: unknown,
    {
      serial,
      boardType,
      layoutId,
      sizeId,
      setIds,
    }: { serial: string; boardType: string; layoutId: number; sizeId: number; setIds: string },
    ctx: ConnectionContext,
  ): Promise<ResolvedBoard> => {
    requireBoardPresenceEnabled();
    requireAuthenticated(ctx);
    await applyRateLimit(ctx, 30, 'resolveBoardForSerial');

    const validSerial = validateInput(BoardSerialSchema, serial, 'serial');
    const validBoardType = validateInput(BoardNameSchema, boardType, 'boardType');
    if (!Number.isInteger(layoutId) || layoutId <= 0) {
      throw new GraphQLError('layoutId must be a positive integer');
    }
    if (!Number.isInteger(sizeId) || sizeId <= 0) {
      throw new GraphQLError('sizeId must be a positive integer');
    }
    if (!setIds || setIds.length === 0) {
      throw new GraphQLError('setIds is required');
    }

    const userId = ctx.userId!;

    // (a) An existing board already owns this serial — that's the shared board.
    const existingBySerial = await findActiveBoardBySerial(validSerial);
    if (existingBySerial) {
      return toResolvedBoard(existingBySerial);
    }

    // (b) The caller already has a board for this exact config — bind the
    // serial onto it instead of creating a duplicate.
    const ownBoardId = await resolveBoardFromPath(userId, validBoardType, layoutId, sizeId, setIds);
    if (ownBoardId) {
      try {
        const [updated] = await db
          .update(dbSchema.userBoards)
          .set({ serialNumber: validSerial, updatedAt: new Date() })
          .where(eq(dbSchema.userBoards.id, ownBoardId))
          .returning();
        if (updated) {
          return toResolvedBoard(updated);
        }
      } catch (error) {
        // Unique-serial race: another connector bound this serial between our
        // SELECT and UPDATE. Re-read the winner.
        logger.warn(`[board-presence] resolveBoardForSerial bind race on own board: ${String(error)}`);
        const winner = await findActiveBoardBySerial(validSerial);
        if (winner) {
          return toResolvedBoard(winner);
        }
        throw error;
      }
    }

    // (c) Create a fresh board owned by the caller, bound to the serial.
    const uuid = uuidv4();
    const name = defaultBoardName(validBoardType);
    const slug = await generateUniqueSlug(name);
    try {
      const [created] = await db
        .insert(dbSchema.userBoards)
        .values({
          uuid,
          slug,
          ownerId: userId,
          boardType: validBoardType,
          layoutId,
          sizeId,
          setIds,
          name,
          serialNumber: validSerial,
        })
        .returning();
      return toResolvedBoard(created);
    } catch (error) {
      // Unique-serial race: someone else created the shared board first.
      logger.warn(`[board-presence] resolveBoardForSerial create race: ${String(error)}`);
      const winner = await findActiveBoardBySerial(validSerial);
      if (winner) {
        return toResolvedBoard(winner);
      }
      throw error;
    }
  },

  /**
   * Report the climb a connected phone just lit on the wall to the board's
   * live "now on the wall" feed. Fire-and-forget after the BLE write — no
   * confirm/timeout handshake.
   *
   * Identity (`sentByDisplayName` / `sentByAvatarUrl`) is derived server-side
   * from `ctx.userId` and never read from the input, so a client can't forge
   * who lit the climb. The reported `climbUuid` must be a real catalog climb.
   */
  reportBoardClimb: async (
    _: unknown,
    { boardId, climb, angle }: { boardId: number; climb: ClimbQueueItemInput; angle?: number | null },
    ctx: ConnectionContext,
  ): Promise<boolean> => {
    requireBoardPresenceEnabled();
    requireAuthenticated(ctx);
    await applyRateLimit(ctx, 60, 'reportBoardClimb');
    assertValidBoardId(boardId);

    const climbUuid = climb?.climb?.uuid;
    if (!climbUuid || typeof climbUuid !== 'string') {
      throw new GraphQLError('climb.climb.uuid is required');
    }

    // Validate the climb is a real catalog climb. A bogus uuid would put a
    // phantom entry on the wall feed.
    const [catalogClimb] = await db
      .select({ uuid: dbSchema.boardClimbs.uuid })
      .from(dbSchema.boardClimbs)
      .where(eq(dbSchema.boardClimbs.uuid, climbUuid))
      .limit(1);
    if (!catalogClimb) {
      throw new GraphQLError('Unknown climb');
    }

    // Derive the sender's display identity server-side from ctx.userId —
    // same source SessionUser / the social feeds use. NEVER trust the input.
    const [sender] = await db
      .select({
        name: dbSchema.users.name,
        image: dbSchema.users.image,
        displayName: dbSchema.userProfiles.displayName,
        avatarUrl: dbSchema.userProfiles.avatarUrl,
      })
      .from(dbSchema.users)
      .leftJoin(dbSchema.userProfiles, eq(dbSchema.users.id, dbSchema.userProfiles.userId))
      .where(eq(dbSchema.users.id, ctx.userId!))
      .limit(1);

    const seq = await pubsub.nextBoardSeq(String(boardId));
    const sentAt = new Date().toISOString();

    const presenceClimb: BoardPresenceClimb = {
      climbUuid,
      queueItemUuid: climb.uuid ?? null,
      name: climb.climb.name ?? null,
      // ClimbInput carries the consensus grade as `difficulty`; there's no
      // gradeColor on the wire, so it stays null (the client renders colour
      // from the grade locally).
      grade: climb.climb.difficulty ?? null,
      gradeColor: null,
      frames: climb.climb.frames ?? null,
      angle: angle ?? null,
      setter: climb.climb.setter_username ?? null,
      sentByDisplayName: sender?.displayName ?? sender?.name ?? null,
      sentByAvatarUrl: sender?.avatarUrl ?? sender?.image ?? null,
      sentAt,
      seq,
    };

    await pubsub.storeBoardClimb(String(boardId), presenceClimb);
    pubsub.publishBoardPresenceEvent(String(boardId), {
      __typename: 'BoardClimbSet',
      climb: presenceClimb,
    });

    return true;
  },
};
