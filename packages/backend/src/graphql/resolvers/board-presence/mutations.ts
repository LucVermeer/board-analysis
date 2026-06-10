import { v4 as uuidv4 } from 'uuid';
import { and, eq, isNull, sql } from 'drizzle-orm';
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
import { BoardSerialSchema } from '../../../validation/schemas/primitives';
import {
  BoardPresenceAngleSchema,
  BoardPresenceConfigInputSchema,
  ReportBoardClimbInputSchema,
} from '../../../validation/schemas';
import { generateUniqueSlug } from '../social/boards';
import { logger } from '../../../utils/logger';
import { pubsub } from '../../../pubsub/index';
import {
  defaultBoardName,
  findActiveBoardBySerial,
  findOwnActiveBoardByConfig,
  isDuplicateBoardSerialError,
  requireActiveBoardById,
  requireBoardPresenceEnabled,
  resolveSharedBoardForConfig,
  serialAlreadyBoundError,
  throwIfDuplicateBoardSerial,
  toResolvedBoard,
} from './shared';

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
    const config = validateInput(BoardPresenceConfigInputSchema, { boardType, layoutId, sizeId, setIds }, 'input');

    const userId = ctx.userId!;

    // (a) An existing board already owns this serial — that's the shared board.
    const existingBySerial = await findActiveBoardBySerial(validSerial);
    if (existingBySerial) {
      return toResolvedBoard(existingBySerial);
    }

    // (b) The caller already has a board for this exact config — bind the
    // serial onto it instead of creating a duplicate, but only if it is not
    // already bound to a different physical wall.
    const ownBoard = await findOwnActiveBoardByConfig(
      userId,
      config.boardType,
      config.layoutId,
      config.sizeId,
      config.setIds,
    );
    if (ownBoard) {
      if (ownBoard.serialNumber && ownBoard.serialNumber !== validSerial) {
        throw serialAlreadyBoundError();
      }

      try {
        const [updated] = await db
          .update(dbSchema.userBoards)
          .set({ serialNumber: validSerial, updatedAt: new Date() })
          .where(and(eq(dbSchema.userBoards.id, ownBoard.id), isNull(dbSchema.userBoards.serialNumber)))
          .returning();
        if (updated) {
          return toResolvedBoard(updated);
        }
      } catch (error) {
        // Unique-serial race: another connector bound this serial between our
        // SELECT and UPDATE. Re-read the winner.
        if (isDuplicateBoardSerialError(error)) {
          logger.warn(`[board-presence] resolveBoardForSerial bind race on own board: ${String(error)}`);
          const winner = await findActiveBoardBySerial(validSerial);
          if (winner) {
            return toResolvedBoard(winner);
          }
        }
        throw error;
      }

      const refreshedOwnBoard = await findOwnActiveBoardByConfig(
        userId,
        config.boardType,
        config.layoutId,
        config.sizeId,
        config.setIds,
      );
      if (refreshedOwnBoard?.serialNumber === validSerial) {
        return toResolvedBoard(refreshedOwnBoard);
      }
      if (refreshedOwnBoard?.serialNumber) {
        throw serialAlreadyBoundError();
      }
    }

    // (c) Create a fresh board owned by the caller, bound to the serial.
    const uuid = uuidv4();
    const name = defaultBoardName(config.boardType);
    const slug = await generateUniqueSlug(name);
    try {
      const [created] = await db
        .insert(dbSchema.userBoards)
        .values({
          uuid,
          slug,
          ownerId: userId,
          boardType: config.boardType,
          layoutId: config.layoutId,
          sizeId: config.sizeId,
          setIds: config.setIds,
          name,
          serialNumber: validSerial,
        })
        .returning();
      return toResolvedBoard(created);
    } catch (error) {
      // Unique-serial race: someone else created the shared board first.
      if (isDuplicateBoardSerialError(error)) {
        logger.warn(`[board-presence] resolveBoardForSerial create race: ${String(error)}`);
        const winner = await findActiveBoardBySerial(validSerial);
        if (winner) {
          return toResolvedBoard(winner);
        }
      }
      throwIfDuplicateBoardSerial(error);
      throw error;
    }
  },

  /**
   * Resolve the shared board feed for boards that do not expose a BLE serial
   * (MoonBoard and any future serial-less hardware). This is per-config in v1:
   * every caller with the same board config converges on the same hidden,
   * system-owned board_id. Aurora callers should continue using the serial
   * resolver above.
   */
  resolveBoardForConfig: async (
    _: unknown,
    { boardType, layoutId, sizeId, setIds }: { boardType: string; layoutId: number; sizeId: number; setIds: string },
    ctx: ConnectionContext,
  ): Promise<ResolvedBoard> => {
    requireBoardPresenceEnabled();
    requireAuthenticated(ctx);
    await applyRateLimit(ctx, 30, 'resolveBoardForConfig');

    const config = validateInput(BoardPresenceConfigInputSchema, { boardType, layoutId, sizeId, setIds }, 'input');
    return resolveSharedBoardForConfig(config.boardType, config.layoutId, config.sizeId, config.setIds);
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
    const board = await requireActiveBoardById(boardId);
    const validatedClimb = validateInput(ReportBoardClimbInputSchema, climb, 'climb');
    const validatedAngle = validateInput(BoardPresenceAngleSchema, angle, 'angle');
    const effectiveAngle = validatedAngle ?? validatedClimb.climb.angle ?? Number(board.angle);
    const climbUuid = validatedClimb.climb.uuid;

    const [catalogClimbRows, sender] = await Promise.all([
      db
        .select({
          uuid: dbSchema.boardClimbs.uuid,
          name: dbSchema.boardClimbs.name,
          frames: dbSchema.boardClimbs.frames,
          setterUsername: dbSchema.boardClimbs.setterUsername,
          grade: dbSchema.boardDifficultyGrades.boulderName,
        })
        .from(dbSchema.boardClimbs)
        .leftJoin(
          dbSchema.boardClimbStats,
          and(
            eq(dbSchema.boardClimbStats.boardType, dbSchema.boardClimbs.boardType),
            eq(dbSchema.boardClimbStats.climbUuid, dbSchema.boardClimbs.uuid),
            eq(dbSchema.boardClimbStats.angle, effectiveAngle),
          ),
        )
        .leftJoin(
          dbSchema.boardDifficultyGrades,
          and(
            eq(dbSchema.boardDifficultyGrades.boardType, dbSchema.boardClimbStats.boardType),
            eq(dbSchema.boardDifficultyGrades.difficulty, sql`ROUND(${dbSchema.boardClimbStats.displayDifficulty})`),
          ),
        )
        .where(
          and(
            eq(dbSchema.boardClimbs.uuid, climbUuid),
            eq(dbSchema.boardClimbs.boardType, board.boardType),
            eq(dbSchema.boardClimbs.layoutId, Number(board.layoutId)),
          ),
        )
        .limit(1),
      db
        .select({
          name: dbSchema.users.name,
          image: dbSchema.users.image,
          displayName: dbSchema.userProfiles.displayName,
          avatarUrl: dbSchema.userProfiles.avatarUrl,
        })
        .from(dbSchema.users)
        .leftJoin(dbSchema.userProfiles, eq(dbSchema.users.id, dbSchema.userProfiles.userId))
        .where(eq(dbSchema.users.id, ctx.userId!))
        .limit(1)
        .then((rows) => rows[0]),
    ]);

    const catalogClimb = catalogClimbRows[0];
    if (!catalogClimb) {
      throw new GraphQLError('Unknown climb for this board');
    }

    const seq = await pubsub.nextBoardSeq(String(boardId));
    const sentAt = new Date().toISOString();

    const presenceClimb: BoardPresenceClimb = {
      climbUuid,
      queueItemUuid: validatedClimb.uuid,
      name: catalogClimb.name ?? null,
      grade: catalogClimb.grade ?? null,
      gradeColor: null,
      frames: catalogClimb.frames ?? null,
      angle: effectiveAngle,
      setter: catalogClimb.setterUsername ?? null,
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
