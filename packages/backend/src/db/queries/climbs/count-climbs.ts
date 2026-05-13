import { sql, and } from 'drizzle-orm';
import { db } from '../../client';
import { boardClimbs, boardClimbStats } from '@boardsesh/db/schema';
import { createClimbFilters, type BoardRouteParams, type ClimbSearchParams } from '@boardsesh/db/queries';
import { logger } from '../../../utils/logger';

/**
 * Counts the total number of climbs matching the search criteria.
 * This is a separate query from searchClimbs to avoid the expensive count(*) over()
 * window function that forces a full table scan.
 *
 * This query is only executed when the `totalCount` field is requested in the GraphQL query.
 * The ClimbSearchResult type uses field-level resolvers, so if a client only requests
 * `climbs` and `hasMore`, this count query is never executed - improving performance.
 *
 * @see resolvers.ts ClimbSearchResult.totalCount for the field resolver
 */
export const countClimbs = async (
  params: BoardRouteParams,
  searchParams: ClimbSearchParams,
  userId?: string,
): Promise<number> => {
  const filters = createClimbFilters(params, searchParams, userId);

  const isDraftsQuery = !!searchParams.onlyDrafts;

  const whereConditions = [
    ...filters.getClimbWhereConditions(),
    // Draft climbs may have NULL compatible_size_ids (denormalized columns not yet populated),
    // so skip the size filter entirely — users must be able to find their freshly saved drafts.
    ...(isDraftsQuery ? [] : filters.getSizeConditions()),
    // Draft climbs never have stats rows — skip stats filters to avoid rejecting all drafts
    ...(isDraftsQuery ? [] : filters.getClimbStatsConditions()),
  ];

  try {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(boardClimbs)
      .leftJoin(boardClimbStats, and(...filters.getClimbStatsJoinConditions()))
      .where(and(...whereConditions));

    return Number(result[0]?.count ?? 0);
  } catch (error) {
    logger.error('Error in countClimbs:', error);
    throw error;
  }
};
