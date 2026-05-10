import crypto from 'crypto';
import { and, eq, sql } from 'drizzle-orm';
import {
  type ConnectionContext,
  type SaveClimbResult,
  type UpdateClimbResult,
  SUPPORTED_BOARDS,
} from '@boardsesh/shared-schema';
import { db } from '../../../db/client';
import * as dbSchema from '@boardsesh/db/schema';
import { UNIFIED_TABLES, isValidBoardName } from '../../../db/queries/util/table-select';
import { populateDenormalizedColumns } from '@boardsesh/db/queries';
import { publishSocialEvent } from '../../../events';
import { requireAuthenticated, applyRateLimit, validateInput } from '../shared/helpers';
import {
  buildMoonBoardClimbHoldRows,
  buildMoonBoardDuplicateError,
  encodeMoonBoardHoldsToFrames,
  findMoonBoardDuplicateMatch,
} from './moonboard-duplicates';
import {
  BoardNameSchema,
  ExternalUUIDSchema,
  SaveClimbInputSchema,
  SaveMoonBoardClimbInputSchema,
  UpdateClimbInputSchema,
} from '../../../validation/schemas';

type SaveClimbArgs = { input: unknown };
type DeleteDraftClimbArgs = { uuid: unknown; boardType: unknown };

function generateClimbUuid(): string {
  // Match Aurora-style uppercase UUID without dashes
  return crypto.randomUUID().replace(/-/g, '').toUpperCase();
}

async function getUserProfile(userId: string) {
  const [user] = await db
    .select({
      name: dbSchema.users.name,
      image: dbSchema.users.image,
      displayName: dbSchema.userProfiles.displayName,
      avatarUrl: dbSchema.userProfiles.avatarUrl,
    })
    .from(dbSchema.users)
    .leftJoin(dbSchema.userProfiles, eq(dbSchema.users.id, dbSchema.userProfiles.userId))
    .where(eq(dbSchema.users.id, userId))
    .limit(1);

  return {
    displayName: user?.displayName || user?.name || '',
    name: user?.name || '',
    avatarUrl: user?.avatarUrl || user?.image || undefined,
  };
}

async function resolveDifficultyId(boardType: string, grade?: string | null): Promise<number | null> {
  if (!grade) return null;
  const normalizedGrade = grade.trim().toLowerCase();
  const rawFontPart = normalizedGrade.split('/')[0].trim();
  const fontPart = rawFontPart === '5+' ? '5a' : rawFontPart;

  const [row] = await db
    .select({ difficulty: dbSchema.boardDifficultyGrades.difficulty })
    .from(dbSchema.boardDifficultyGrades)
    .where(
      and(
        eq(dbSchema.boardDifficultyGrades.boardType, boardType),
        sql`(
          LOWER(${dbSchema.boardDifficultyGrades.boulderName}) = ${normalizedGrade}
          OR LOWER(SPLIT_PART(${dbSchema.boardDifficultyGrades.boulderName}, '/', 1)) = ${fontPart}
        )`,
      ),
    )
    .orderBy(
      sql`CASE WHEN LOWER(${dbSchema.boardDifficultyGrades.boulderName}) = ${normalizedGrade} THEN 0 ELSE 1 END`,
      dbSchema.boardDifficultyGrades.difficulty,
    )
    .limit(1);

  return row?.difficulty ?? null;
}

export const climbMutations = {
  /**
   * Save a new climb for Aurora-style boards (kilter/tension) via GraphQL.
   * Persists to the unified board_climbs table and publishes a climb.created event.
   */
  saveClimb: async (_: unknown, { input }: SaveClimbArgs, ctx: ConnectionContext): Promise<SaveClimbResult> => {
    requireAuthenticated(ctx);
    await applyRateLimit(ctx, 10);

    const validated = validateInput(SaveClimbInputSchema, input, 'input');
    const isListed = !validated.isDraft;

    if (!isValidBoardName(validated.boardType)) {
      throw new Error(
        `Invalid board type: ${String(validated.boardType)}. Must be one of ${SUPPORTED_BOARDS.join(', ')}`,
      );
    }

    const now = new Date().toISOString();
    const publishedAt = validated.isDraft ? null : now;
    const { displayName, name, avatarUrl } = await getUserProfile(ctx.userId!);
    const preferredSetter = displayName || name || null;

    const uuid = generateClimbUuid();

    await db.insert(UNIFIED_TABLES.climbs).values({
      boardType: validated.boardType,
      uuid,
      layoutId: validated.layoutId,
      userId: ctx.userId!,
      setterId: null,
      setterUsername: preferredSetter,
      name: validated.name,
      description: validated.description ?? '',
      angle: validated.angle,
      framesCount: validated.framesCount ?? 1,
      framesPace: validated.framesPace ?? 0,
      frames: validated.frames,
      isDraft: validated.isDraft,
      isListed,
      createdAt: now,
      publishedAt,
      synced: false,
      syncError: null,
    });

    // Populate denormalized required_set_ids and compatible_size_ids
    await populateDenormalizedColumns(db, validated.boardType, [uuid]);

    await publishSocialEvent({
      type: 'climb.created',
      actorId: ctx.userId!,
      entityType: 'climb',
      entityId: uuid,
      timestamp: Date.now(),
      metadata: {
        boardType: validated.boardType,
        layoutId: String(validated.layoutId),
        climbName: validated.name,
        climbUuid: uuid,
        angle: String(validated.angle),
        frames: validated.frames,
        setterDisplayName: preferredSetter || '',
        setterAvatarUrl: avatarUrl || '',
      },
    });

    return { uuid, synced: false, createdAt: now, publishedAt };
  },

  /**
   * Save a new MoonBoard climb via GraphQL.
   * Encodes holds to frames, optionally stores grade stats, and publishes climb.created.
   */
  saveMoonBoardClimb: async (
    _: unknown,
    { input }: SaveClimbArgs,
    ctx: ConnectionContext,
  ): Promise<SaveClimbResult> => {
    requireAuthenticated(ctx);
    await applyRateLimit(ctx, 10);

    const validated = validateInput(SaveMoonBoardClimbInputSchema, input, 'input');
    const isDraft = validated.isDraft ?? false;
    const isListed = !isDraft;

    if (validated.boardType !== 'moonboard') {
      throw new Error('saveMoonBoardClimb is only supported for boardType=moonboard');
    }

    const uuid = generateClimbUuid();
    const now = new Date().toISOString();
    const publishedAt = isDraft ? null : now;
    const { displayName, name, avatarUrl } = await getUserProfile(ctx.userId!);
    const preferredSetter = validated.setter || displayName || name || null;

    const duplicateMatch = await findMoonBoardDuplicateMatch(validated.layoutId, validated.angle, validated.holds);
    if (duplicateMatch) {
      throw new Error(buildMoonBoardDuplicateError(duplicateMatch.existingClimbName));
    }

    const frames = encodeMoonBoardHoldsToFrames(validated.holds);

    await db.insert(UNIFIED_TABLES.climbs).values({
      boardType: validated.boardType,
      uuid,
      layoutId: validated.layoutId,
      userId: ctx.userId!,
      setterId: null,
      setterUsername: preferredSetter,
      name: validated.name,
      description: validated.description ?? '',
      angle: validated.angle,
      framesCount: 1,
      framesPace: 0,
      frames,
      isDraft,
      isListed,
      createdAt: now,
      publishedAt,
      synced: false,
      syncError: null,
    });

    const holdRows = buildMoonBoardClimbHoldRows(uuid, validated.holds);
    if (holdRows.length > 0) {
      await db.insert(dbSchema.boardClimbHolds).values(holdRows).onConflictDoNothing();
    }

    // Optional grade stats
    const difficultyId = await resolveDifficultyId(validated.boardType, validated.userGrade);
    if (difficultyId !== null) {
      await db
        .insert(dbSchema.boardClimbStats)
        .values({
          boardType: validated.boardType,
          climbUuid: uuid,
          angle: validated.angle,
          displayDifficulty: difficultyId,
          benchmarkDifficulty: validated.isBenchmark ? difficultyId : null,
          ascensionistCount: 0,
          difficultyAverage: difficultyId,
          qualityAverage: null,
          faUsername: validated.setter || null,
          faAt: null,
        })
        .onConflictDoUpdate({
          target: [
            dbSchema.boardClimbStats.boardType,
            dbSchema.boardClimbStats.climbUuid,
            dbSchema.boardClimbStats.angle,
          ],
          set: {
            displayDifficulty: difficultyId,
            benchmarkDifficulty: validated.isBenchmark ? difficultyId : null,
            difficultyAverage: difficultyId,
          },
        });
    }

    await publishSocialEvent({
      type: 'climb.created',
      actorId: ctx.userId!,
      entityType: 'climb',
      entityId: uuid,
      timestamp: Date.now(),
      metadata: {
        boardType: validated.boardType,
        layoutId: String(validated.layoutId),
        climbName: validated.name,
        climbUuid: uuid,
        angle: String(validated.angle),
        frames,
        setterDisplayName: preferredSetter || '',
        setterAvatarUrl: avatarUrl || '',
        difficultyName: validated.userGrade || '',
      },
    });

    return { uuid, synced: false, createdAt: now, publishedAt };
  },

  /**
   * Update an existing climb in-place. Enforces ownership and a 24h edit
   * window on published climbs. Drafts can be edited indefinitely.
   *
   * A climb can transition from draft → published via `isDraft: false` —
   * that sets `publishedAt` to now and starts the 24h clock. The reverse
   * transition is not allowed (can't un-publish).
   */
  updateClimb: async (
    _: unknown,
    { input }: { input: unknown },
    ctx: ConnectionContext,
  ): Promise<UpdateClimbResult> => {
    requireAuthenticated(ctx);
    await applyRateLimit(ctx, 20);

    const validated = validateInput(UpdateClimbInputSchema, input, 'input');

    if (!isValidBoardName(validated.boardType)) {
      throw new Error(
        `Invalid board type: ${String(validated.boardType)}. Must be one of ${SUPPORTED_BOARDS.join(', ')}`,
      );
    }

    // Load the existing row and verify ownership + edit window.
    const [existing] = await db
      .select({
        uuid: dbSchema.boardClimbs.uuid,
        userId: dbSchema.boardClimbs.userId,
        isDraft: dbSchema.boardClimbs.isDraft,
        publishedAt: dbSchema.boardClimbs.publishedAt,
        createdAt: dbSchema.boardClimbs.createdAt,
      })
      .from(dbSchema.boardClimbs)
      .where(
        and(eq(dbSchema.boardClimbs.uuid, validated.uuid), eq(dbSchema.boardClimbs.boardType, validated.boardType)),
      )
      .limit(1);

    if (!existing) {
      throw new Error('Climb not found');
    }

    if (existing.userId !== ctx.userId!) {
      throw new Error('You can only update your own climbs');
    }

    const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;
    const currentlyDraft = existing.isDraft === true;

    if (!currentlyDraft) {
      // Non-draft: only editable within 24h of the first publish.
      if (!existing.publishedAt) {
        throw new Error('This climb can no longer be edited');
      }
      const publishedMs = Date.parse(existing.publishedAt);
      if (!Number.isFinite(publishedMs) || Date.now() - publishedMs > EDIT_WINDOW_MS) {
        throw new Error('The 24 hour edit window has expired');
      }
    }

    // Decide the next draft/publish state. We only honor a transition from
    // draft → published; a publish → draft attempt is silently ignored.
    let nextIsDraft: boolean;
    if (validated.isDraft === undefined) {
      nextIsDraft = existing.isDraft ?? false;
    } else if (currentlyDraft && validated.isDraft === false) {
      nextIsDraft = false;
    } else {
      nextIsDraft = existing.isDraft ?? false;
    }

    const transitioningToPublished = currentlyDraft && validated.isDraft === false;
    const now = new Date().toISOString();
    const nextPublishedAt = transitioningToPublished ? now : existing.publishedAt;

    // Build the update set from provided fields only.
    const updateSet: Record<string, unknown> = {
      isDraft: nextIsDraft,
      isListed: !nextIsDraft,
      publishedAt: nextPublishedAt,
    };
    if (validated.name !== undefined) updateSet.name = validated.name;
    if (validated.description !== undefined) updateSet.description = validated.description;
    if (validated.frames !== undefined) updateSet.frames = validated.frames;
    if (validated.angle !== undefined) updateSet.angle = validated.angle;
    if (validated.framesCount !== undefined) updateSet.framesCount = validated.framesCount;
    if (validated.framesPace !== undefined) updateSet.framesPace = validated.framesPace;

    await db
      .update(dbSchema.boardClimbs)
      .set(updateSet)
      .where(
        and(eq(dbSchema.boardClimbs.uuid, validated.uuid), eq(dbSchema.boardClimbs.boardType, validated.boardType)),
      );

    // If frames changed we need to refresh the denormalized edge/set columns
    // so search filters still match.
    if (validated.frames !== undefined) {
      await populateDenormalizedColumns(db, validated.boardType, [validated.uuid]);
    }

    // On a draft → published transition, announce the new climb so follower
    // feeds pick it up, the same way saveClimb does.
    if (transitioningToPublished) {
      const { displayName, name, avatarUrl } = await getUserProfile(ctx.userId);
      const preferredSetter = displayName || name || null;
      await publishSocialEvent({
        type: 'climb.created',
        actorId: ctx.userId,
        entityType: 'climb',
        entityId: validated.uuid,
        timestamp: Date.now(),
        metadata: {
          boardType: validated.boardType,
          layoutId: '',
          climbName: validated.name ?? '',
          climbUuid: validated.uuid,
          angle: validated.angle !== undefined ? String(validated.angle) : '',
          frames: validated.frames ?? '',
          setterDisplayName: preferredSetter || '',
          setterAvatarUrl: avatarUrl || '',
        },
      });
    }

    return {
      uuid: validated.uuid,
      createdAt: existing.createdAt,
      publishedAt: nextPublishedAt,
      isDraft: nextIsDraft,
    };
  },

  /**
   * Delete an unpublished draft climb owned by the current user. This path is
   * intentionally narrower than account deletion: published climbs are never
   * removed here, even if the caller owns them.
   */
  deleteDraftClimb: async (
    _: unknown,
    { uuid, boardType }: DeleteDraftClimbArgs,
    ctx: ConnectionContext,
  ): Promise<boolean> => {
    requireAuthenticated(ctx);
    await applyRateLimit(ctx, 20);

    const validatedUuid = validateInput(ExternalUUIDSchema, uuid, 'uuid');
    const validatedBoardType = validateInput(BoardNameSchema, boardType, 'boardType');

    await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({
          uuid: dbSchema.boardClimbs.uuid,
          userId: dbSchema.boardClimbs.userId,
          isDraft: dbSchema.boardClimbs.isDraft,
        })
        .from(dbSchema.boardClimbs)
        .where(
          and(eq(dbSchema.boardClimbs.uuid, validatedUuid), eq(dbSchema.boardClimbs.boardType, validatedBoardType)),
        )
        .limit(1);

      if (!existing) {
        throw new Error('Climb not found');
      }

      if (existing.userId !== ctx.userId!) {
        throw new Error('You can only delete your own draft climbs');
      }

      if (existing.isDraft !== true) {
        throw new Error('Published climbs cannot be deleted here');
      }

      await tx
        .delete(dbSchema.boardClimbStats)
        .where(
          and(
            eq(dbSchema.boardClimbStats.boardType, validatedBoardType),
            eq(dbSchema.boardClimbStats.climbUuid, validatedUuid),
          ),
        );

      await tx
        .delete(dbSchema.boardClimbStatsHistory)
        .where(
          and(
            eq(dbSchema.boardClimbStatsHistory.boardType, validatedBoardType),
            eq(dbSchema.boardClimbStatsHistory.climbUuid, validatedUuid),
          ),
        );

      await tx
        .delete(dbSchema.boardBetaLinks)
        .where(
          and(
            eq(dbSchema.boardBetaLinks.boardType, validatedBoardType),
            eq(dbSchema.boardBetaLinks.climbUuid, validatedUuid),
          ),
        );

      const deletedRows = await tx
        .delete(dbSchema.boardClimbs)
        .where(
          and(
            eq(dbSchema.boardClimbs.uuid, validatedUuid),
            eq(dbSchema.boardClimbs.boardType, validatedBoardType),
            eq(dbSchema.boardClimbs.userId, ctx.userId!),
            eq(dbSchema.boardClimbs.isDraft, true),
          ),
        )
        .returning({ uuid: dbSchema.boardClimbs.uuid });

      if (deletedRows.length === 0) {
        throw new Error('Draft climb could not be deleted');
      }
    });

    return true;
  },
};
