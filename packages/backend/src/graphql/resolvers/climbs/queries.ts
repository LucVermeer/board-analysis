import { eq, and, gte, desc } from 'drizzle-orm';
import {
  type CheckMoonBoardClimbDuplicatesInput,
  type ClimbSearchInput,
  type ConnectionContext,
  type SimilarClimb,
  type SimilarClimbsInput,
  SUPPORTED_BOARDS,
  USER_SPECIFIC_SEARCH_PARAMS,
} from '@boardsesh/shared-schema';
import type { BoardName } from '@boardsesh/board-constants';
import { logger } from '../../../utils/logger';
import {
  type ClimbSearchParams,
  type ParsedBoardRouteParameters,
  getClimbByUuid,
} from '../../../db/queries/climbs/index';
import { isValidBoardName } from '../../../db/queries/util/table-select';
import { applyRateLimit, validateInput } from '../shared/helpers';
import { findMoonBoardDuplicateMatches } from './moonboard-duplicates';
import { findSimilarClimbs, parseFramesToHoldEntries, type NormalizedHold } from './climb-similarity';
import {
  BoardNameSchema,
  CheckMoonBoardClimbDuplicatesInputSchema,
  ClimbSearchInputSchema,
  ExternalUUIDSchema,
  SimilarClimbsInputSchema,
} from '../../../validation/schemas';
import type { ClimbSearchContext } from '../shared/types';
import { db } from '../../../db/client';
import * as dbSchema from '@boardsesh/db/schema';

// Debug logging flag - only log in development
const DEBUG = process.env.NODE_ENV === 'development';

export const climbQueries = {
  checkMoonBoardClimbDuplicates: async (
    _: unknown,
    { input }: { input: CheckMoonBoardClimbDuplicatesInput },
    ctx: ConnectionContext,
  ) => {
    await applyRateLimit(ctx, 60, 'moonboard-duplicate-check');
    const validated = validateInput(CheckMoonBoardClimbDuplicatesInputSchema, input, 'input');
    return findMoonBoardDuplicateMatches(validated.layoutId, validated.angle, validated.climbs);
  },

  /**
   * Find climbs on the same board+layout that share at least `threshold`
   * (default 0.5) position-only Jaccard similarity with the target's holds.
   * Used by the playview drawer's similar-climbs panel (0.5) and by the
   * create-climb form to preview the exact duplicate when a publish is
   * blocked (1.0).
   */
  similarClimbs: async (
    _: unknown,
    { input }: { input: SimilarClimbsInput },
    ctx: ConnectionContext,
  ): Promise<SimilarClimb[]> => {
    await applyRateLimit(ctx, 60, 'similar-climbs');
    const validated = validateInput(SimilarClimbsInputSchema, input, 'input');

    if (!isValidBoardName(validated.boardType)) {
      throw new Error(`Invalid board name: ${validated.boardType}. Must be one of: ${SUPPORTED_BOARDS.join(', ')}`);
    }
    const boardType = validated.boardType as BoardName;

    let holds: NormalizedHold[];
    let excludeUuid = validated.excludeClimbUuid ?? undefined;

    if (validated.climbUuid) {
      const targetHoldRows = await db
        .select({
          holdId: dbSchema.boardClimbHolds.holdId,
          holdState: dbSchema.boardClimbHolds.holdState,
        })
        .from(dbSchema.boardClimbHolds)
        .where(
          and(
            eq(dbSchema.boardClimbHolds.boardType, boardType),
            eq(dbSchema.boardClimbHolds.climbUuid, validated.climbUuid),
          ),
        );
      holds = targetHoldRows.map((row) => ({ holdId: row.holdId, holdState: row.holdState }));
      // Always exclude the target climb itself from its own similar list.
      excludeUuid = validated.climbUuid;
    } else {
      holds = parseFramesToHoldEntries(boardType, validated.frames ?? '').map(({ holdId, holdState }) => ({
        holdId,
        holdState,
      }));
    }

    if (holds.length === 0) return [];

    return findSimilarClimbs({
      boardType,
      layoutId: validated.layoutId,
      holds,
      threshold: validated.threshold ?? 0.5,
      limit: validated.limit ?? 25,
      excludeUuid,
    });
  },

  /**
   * Search for climbs with various filters
   * Returns a context object that field resolvers use to fetch data lazily
   */
  searchClimbs: async (
    _: unknown,
    { input }: { input: ClimbSearchInput },
    ctx: ConnectionContext,
  ): Promise<ClimbSearchContext> => {
    validateInput(ClimbSearchInputSchema, input, 'input');

    // Validate board name
    if (!isValidBoardName(input.boardName)) {
      throw new Error(`Invalid board name: ${input.boardName}. Must be one of: ${SUPPORTED_BOARDS.join(', ')}`);
    }

    // Parse setIds from comma-separated string
    const setIds = input.setIds
      .split(',')
      .map((id) => parseInt(id.trim(), 10))
      .filter((id) => !isNaN(id));

    // Build route parameters
    const params: ParsedBoardRouteParameters = {
      board_name: input.boardName,
      layout_id: input.layoutId,
      size_id: input.sizeId,
      set_ids: setIds,
      angle: input.angle,
    };

    // Build search parameters
    const searchParams: ClimbSearchParams = {
      page: input.page ?? 0,
      pageSize: input.pageSize ?? 20,
      gradeAccuracy: input.gradeAccuracy ? parseFloat(input.gradeAccuracy) : undefined,
      minGrade: input.minGrade,
      maxGrade: input.maxGrade,
      minAscents: input.minAscents,
      minRating: input.minRating,
      sortBy: input.sortBy ?? 'ascents',
      sortOrder: input.sortOrder ?? 'desc',
      name: input.name,
      settername: input.setter && input.setter.length > 0 ? input.setter : undefined,
      onlyTallClimbs: input.onlyTallClimbs,
      onlyWideClimbs: input.onlyWideClimbs,
      holdsFilter: input.holdsFilter,
      hideAttempted: input.hideAttempted,
      hideCompleted: input.hideCompleted,
      showOnlyAttempted: input.showOnlyAttempted,
      showOnlyCompleted: input.showOnlyCompleted,
      onlyDrafts: input.onlyDrafts,
      projectsOnly: input.projectsOnly,
      zoneBox: input.zoneBox,
      zoneMode: input.zoneMode,
    };

    if (DEBUG) {
      logger.info(
        '[searchClimbs] onlyDrafts:',
        input.onlyDrafts,
        'userId:',
        ctx.isAuthenticated ? ctx.userId : 'not authenticated',
      );
    }

    // Drafts require authentication — return empty results if not signed in
    if (input.onlyDrafts && !ctx.isAuthenticated) {
      return {
        params,
        searchParams,
        userId: undefined,
        _cachedClimbs: [],
        _cachedHasMore: false,
        _cachedTotalCount: 0,
      };
    }

    // MoonBoard data changes frequently via local creation/import flows, so keep
    // GraphQL search results uncached there. Other boards can still use Redis
    // when the query is anonymous and has no user-specific filters.
    const hasUserSpecificFilters = USER_SPECIFIC_SEARCH_PARAMS.some(
      (param) => !!searchParams[param as keyof typeof searchParams],
    );
    const isCacheableBoard = input.boardName !== 'moonboard';

    // Only resolve userId when user-specific filters are active — otherwise the query
    // results are identical to anonymous and can be served from Redis cache.
    const userId = ctx.isAuthenticated && hasUserSpecificFilters ? ctx.userId : undefined;

    // Return context for field resolvers - queries are executed lazily per field
    // Personal progress filters now use boardsesh_ticks table with NextAuth user ID
    return {
      params,
      searchParams,
      userId,
      _isCacheable: !hasUserSpecificFilters && isCacheableBoard,
    };
  },

  /**
   * Get a specific climb by UUID
   */
  climb: async (
    _: unknown,
    {
      boardName,
      layoutId,
      sizeId,
      setIds,
      angle,
      climbUuid,
    }: {
      boardName: string;
      layoutId: number;
      sizeId: number;
      setIds: string;
      angle: number;
      climbUuid: string;
    },
  ) => {
    // Validate board name
    validateInput(BoardNameSchema, boardName, 'boardName');

    if (!isValidBoardName(boardName)) {
      throw new Error(`Invalid board name: ${boardName}. Must be one of: ${SUPPORTED_BOARDS.join(', ')}`);
    }

    // Validate all parameters
    if (layoutId <= 0) throw new Error('Invalid layoutId: must be positive');
    if (sizeId <= 0) throw new Error('Invalid sizeId: must be positive');
    if (angle < 0 || angle > 90) throw new Error('Invalid angle: must be between 0 and 90');
    validateInput(ExternalUUIDSchema, climbUuid, 'climbUuid');

    if (DEBUG) logger.info('[climb] Fetching:', { boardName, layoutId, sizeId, setIds, angle, climbUuid });

    const climb = await getClimbByUuid({
      board_name: boardName,
      layout_id: layoutId,
      size_id: sizeId,
      angle,
      climb_uuid: climbUuid,
    });

    return climb;
  },

  /**
   * Get climb stats history for the last 12 months
   */
  climbStatsHistory: async (_: unknown, { boardName, climbUuid }: { boardName: string; climbUuid: string }) => {
    validateInput(BoardNameSchema, boardName, 'boardName');
    validateInput(ExternalUUIDSchema, climbUuid, 'climbUuid');

    if (!isValidBoardName(boardName)) {
      throw new Error(`Invalid board name: ${boardName}. Must be one of: ${SUPPORTED_BOARDS.join(', ')}`);
    }

    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const rows = await db
      .select({
        angle: dbSchema.boardClimbStatsHistory.angle,
        ascensionistCount: dbSchema.boardClimbStatsHistory.ascensionistCount,
        qualityAverage: dbSchema.boardClimbStatsHistory.qualityAverage,
        difficultyAverage: dbSchema.boardClimbStatsHistory.difficultyAverage,
        displayDifficulty: dbSchema.boardClimbStatsHistory.displayDifficulty,
        createdAt: dbSchema.boardClimbStatsHistory.createdAt,
      })
      .from(dbSchema.boardClimbStatsHistory)
      .where(
        and(
          eq(dbSchema.boardClimbStatsHistory.boardType, boardName),
          eq(dbSchema.boardClimbStatsHistory.climbUuid, climbUuid),
          gte(dbSchema.boardClimbStatsHistory.createdAt, twelveMonthsAgo.toISOString()),
        ),
      )
      .orderBy(desc(dbSchema.boardClimbStatsHistory.createdAt));

    return rows;
  },
};
