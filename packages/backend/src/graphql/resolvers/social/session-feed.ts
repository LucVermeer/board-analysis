import { eq, and, desc, sql, count as drizzleCount, isNull, inArray } from 'drizzle-orm';
import { dbRead } from '../../../db/client';
import * as dbSchema from '@boardsesh/db/schema';
import { getGradeLabel } from '@boardsesh/db/queries';
import { rowsFromResult } from '@boardsesh/db/client';
import { validateInput, isNoMatchClimb } from '../shared/helpers';
import { ActivityFeedInputSchema } from '../../../validation/schemas';
import { encodeOffsetCursor, decodeOffsetCursor } from '../../../utils/feed-cursor';
import type {
  SessionFeedItem,
  SessionDetail,
  SessionGradeDistributionItem,
  SessionFeedParticipant,
  SessionDetailTick,
  ConnectionContext,
} from '@boardsesh/shared-schema';
import { logger } from '../../../utils/logger';
import { buildGradeDistributionFromTicks, computeSessionAggregates } from './session-feed-utils';

type SessionFeedFilterOptions = {
  boardTypeFilter: string | null;
  layoutIdFilter: number | null;
};

export const sessionFeedQueries = {
  /**
   * Session-grouped activity feed (public, no auth required).
   * Groups ticks by explicitly-created board sessions only.
   * Always chronological (newest first). Uses offset pagination.
   */
  sessionGroupedFeed: async (_: unknown, { input }: { input?: Record<string, unknown> }) => {
    const validatedInput = validateInput(ActivityFeedInputSchema, input || {}, 'input');
    const limit = validatedInput.limit ?? 20;
    const userId = validatedInput.userId || null;

    const offset = validatedInput.cursor ? (decodeOffsetCursor(validatedInput.cursor) ?? 0) : 0;

    // Board filter
    let boardTypeFilter: string | null = null;
    let layoutIdFilter: number | null = null;
    if (validatedInput.boardUuid) {
      const board = await dbRead
        .select({
          boardType: dbSchema.userBoards.boardType,
          layoutId: dbSchema.userBoards.layoutId,
        })
        .from(dbSchema.userBoards)
        .where(eq(dbSchema.userBoards.uuid, validatedInput.boardUuid))
        .limit(1)
        .then((rows) => rows[0]);

      if (board) {
        boardTypeFilter = board.boardType;
        layoutIdFilter = board.layoutId;
      }
    }

    let sessionRows;
    try {
      const sessionBoardFilter = boardTypeFilter ? sql`AND t.board_type = ${boardTypeFilter}` : sql``;
      const sessionLayoutFilter = layoutIdFilter !== null ? sql`AND cf.layout_id = ${layoutIdFilter}` : sql``;
      // Resolve dedup-merged climbs to their canonical UUID before the layout
      // join — board_climbs only has a row on the canonical, so an aliased tick
      // would otherwise be dropped from a layout-filtered feed. The alias PK
      // (board_type, alias_uuid) keeps the hop to ≤1 row.
      const sessionLayoutJoin =
        layoutIdFilter !== null
          ? sql`LEFT JOIN board_climb_aliases bca ON bca.board_type = t.board_type AND bca.alias_uuid = t.climb_uuid LEFT JOIN board_climbs cf ON cf.uuid = COALESCE(bca.canonical_uuid, t.climb_uuid) AND cf.board_type = t.board_type`
          : sql``;

      sessionRows = await dbRead.execute(sql`
        WITH eligible_sessions AS (
          SELECT DISTINCT t.session_id
          FROM boardsesh_ticks t
          ${sessionLayoutJoin}
          WHERE t.session_id IS NOT NULL
            ${userId ? sql`AND t.user_id = ${userId}` : sql``}
            ${sessionBoardFilter}
            ${sessionLayoutFilter}
        ),
        session_base AS (
          SELECT
            t.session_id AS session_id,
            'party'::text AS session_type,
            MIN(t.climbed_at) AS session_first_tick,
            MAX(t.climbed_at) AS session_last_tick,
            COUNT(*)::int AS tick_count,
            COUNT(*) FILTER (WHERE t.status IN ('flash', 'send'))::int AS total_sends,
            COUNT(*) FILTER (WHERE t.status = 'flash')::int AS total_flashes,
            (
              COALESCE(SUM(GREATEST(t.attempt_count - 1, 0)) FILTER (WHERE t.status = 'send'), 0)
              + COALESCE(SUM(t.attempt_count) FILTER (WHERE t.status = 'attempt'), 0)
            )::int AS total_attempts
          FROM boardsesh_ticks t
          ${sessionLayoutJoin}
          ${userId ? sql`INNER JOIN eligible_sessions es ON es.session_id = t.session_id` : sql``}
          WHERE t.session_id IS NOT NULL
            ${sessionBoardFilter}
            ${sessionLayoutFilter}
          GROUP BY t.session_id
        ),
        scored AS (
          SELECT
            sb.*,
            COALESCE(vc.score, 0) AS vote_score,
            COALESCE(vc.upvotes, 0) AS vote_up,
            COALESCE(vc.downvotes, 0) AS vote_down,
            COALESCE(cc.comment_count, 0) AS comment_count
          FROM session_base sb
          LEFT JOIN vote_counts vc
            ON vc.entity_type = 'session' AND vc.entity_id = sb.session_id
          LEFT JOIN (
            SELECT entity_id, COUNT(*) AS comment_count
            FROM comments
            WHERE entity_type = 'session' AND deleted_at IS NULL
            GROUP BY entity_id
          ) cc ON cc.entity_id = sb.session_id
        )
        SELECT *
        FROM scored
        ORDER BY session_last_tick DESC
        OFFSET ${offset}
        LIMIT ${limit + 1}
      `);
    } catch (err) {
      logger.error('[sessionGroupedFeed] SQL error:', err);
      throw err;
    }

    const rows = rowsFromResult<{
      session_id: string;
      session_type: string;
      session_first_tick: string;
      session_last_tick: string;
      tick_count: number;
      total_sends: number;
      total_flashes: number;
      total_attempts: number;
      vote_score: number;
      vote_up: number;
      vote_down: number;
      comment_count: number;
    }>(sessionRows);

    const hasMore = rows.length > limit;
    const resultRows = hasMore ? rows.slice(0, limit) : rows;

    // Batch enrichment: 4 queries total instead of scanning all ticks
    const sessionIds = resultRows.map((r) => r.session_id);
    const filterOptions: SessionFeedFilterOptions = { boardTypeFilter, layoutIdFilter };

    const [participantMap, gradeDistMap, metaMap, boardTypesMap] = await Promise.all([
      fetchParticipantsBatch(sessionIds, filterOptions),
      fetchGradeDistributionBatch(sessionIds, filterOptions),
      fetchSessionMetaBatch(sessionIds),
      fetchBoardTypesBatch(sessionIds, filterOptions),
    ]);

    const sessions: SessionFeedItem[] = resultRows.map((row) => {
      const participants = participantMap.get(row.session_id) ?? [];
      const gradeDistribution = gradeDistMap.get(row.session_id) ?? [];
      const sessionMeta = metaMap.get(row.session_id) ?? null;
      const boardTypes = boardTypesMap.get(row.session_id) ?? [];

      const firstTime = new Date(row.session_first_tick).getTime();
      const lastTime = new Date(row.session_last_tick).getTime();
      const durationMinutes = Math.round((lastTime - firstTime) / 60000) || null;

      return {
        sessionId: row.session_id,
        sessionType: 'party',
        sessionName: sessionMeta?.name || null,
        ownerUserId: sessionMeta?.ownerUserId || null,
        participants,
        totalSends: Number(row.total_sends),
        totalFlashes: Number(row.total_flashes),
        totalAttempts: Number(row.total_attempts),
        tickCount: Number(row.tick_count),
        gradeDistribution,
        boardTypes,
        hardestGrade: gradeDistribution.length > 0 ? gradeDistribution[0].grade : null,
        firstTickAt:
          typeof row.session_first_tick === 'object'
            ? (row.session_first_tick as unknown as Date).toISOString()
            : String(row.session_first_tick),
        lastTickAt:
          typeof row.session_last_tick === 'object'
            ? (row.session_last_tick as unknown as Date).toISOString()
            : String(row.session_last_tick),
        durationMinutes,
        goal: sessionMeta?.goal || null,
        upvotes: Number(row.vote_up),
        downvotes: Number(row.vote_down),
        voteScore: Number(row.vote_score),
        commentCount: Number(row.comment_count),
      };
    });

    const nextCursor = hasMore ? encodeOffsetCursor(offset + limit) : null;

    return { sessions, cursor: nextCursor, hasMore };
  },

  /**
   * Get full detail for a single session.
   */
  sessionDetail: async (
    _: unknown,
    { sessionId }: { sessionId: string },
    ctx?: ConnectionContext,
  ): Promise<SessionDetail | null> => {
    if (!sessionId) return null;

    const [partySession] = await dbRead
      .select()
      .from(dbSchema.boardSessions)
      .where(eq(dbSchema.boardSessions.id, sessionId))
      .limit(1);

    if (!partySession) return null;

    // Fetch ticks for this session
    const tickRows = await dbRead
      .select({
        tick: dbSchema.boardseshTicks,
        climbName: dbSchema.boardClimbs.name,
        climbDescription: dbSchema.boardClimbs.description,
        setterUsername: dbSchema.boardClimbs.setterUsername,
        layoutId: dbSchema.boardClimbs.layoutId,
        frames: dbSchema.boardClimbs.frames,
        difficultyName: dbSchema.boardDifficultyGrades.boulderName,
        consensusDifficulty: dbSchema.boardClimbStats.displayDifficulty,
      })
      .from(dbSchema.boardseshTicks)
      // Resolve dedup-merged climbs to their canonical UUID before joining
      // board_climbs / board_climb_stats. A tick may point at an alias UUID that
      // was deduplicated away (no board_climbs row); the alias table maps it to
      // the canonical, where both the climb row and its stats live. Ticks already
      // on a canonical have no alias row, so COALESCE falls back to the tick's own
      // climb_uuid. The PK (board_type, alias_uuid) keeps the join to ≤1 row.
      .leftJoin(
        dbSchema.boardClimbAliases,
        and(
          eq(dbSchema.boardseshTicks.climbUuid, dbSchema.boardClimbAliases.aliasUuid),
          eq(dbSchema.boardseshTicks.boardType, dbSchema.boardClimbAliases.boardType),
        ),
      )
      .leftJoin(
        dbSchema.boardClimbs,
        and(
          sql`COALESCE(${dbSchema.boardClimbAliases.canonicalUuid}, ${dbSchema.boardseshTicks.climbUuid}) = ${dbSchema.boardClimbs.uuid}`,
          eq(dbSchema.boardseshTicks.boardType, dbSchema.boardClimbs.boardType),
        ),
      )
      .leftJoin(
        dbSchema.boardDifficultyGrades,
        and(
          eq(dbSchema.boardseshTicks.difficulty, dbSchema.boardDifficultyGrades.difficulty),
          eq(dbSchema.boardseshTicks.boardType, dbSchema.boardDifficultyGrades.boardType),
        ),
      )
      .leftJoin(
        dbSchema.boardClimbStats,
        and(
          sql`COALESCE(${dbSchema.boardClimbAliases.canonicalUuid}, ${dbSchema.boardseshTicks.climbUuid}) = ${dbSchema.boardClimbStats.climbUuid}`,
          eq(dbSchema.boardseshTicks.boardType, dbSchema.boardClimbStats.boardType),
          eq(dbSchema.boardseshTicks.angle, dbSchema.boardClimbStats.angle),
        ),
      )
      .where(eq(dbSchema.boardseshTicks.sessionId, sessionId))
      .orderBy(desc(dbSchema.boardseshTicks.climbedAt));

    if (tickRows.length === 0) return null;

    // Batch-fetch tick vote counts
    const tickUuids = tickRows.map((r) => r.tick.uuid);
    const tickVoteCounts =
      tickUuids.length > 0
        ? await dbRead
            .select({
              entityId: dbSchema.voteCounts.entityId,
              upvotes: sql<number>`COALESCE(${dbSchema.voteCounts.upvotes}, 0)`,
            })
            .from(dbSchema.voteCounts)
            .where(and(eq(dbSchema.voteCounts.entityType, 'tick'), inArray(dbSchema.voteCounts.entityId, tickUuids)))
        : [];
    const tickVoteMap = new Map(tickVoteCounts.map((v) => [v.entityId, Number(v.upvotes)]));

    // Build ticks (totalAttempts added below)
    const ticks: SessionDetailTick[] = tickRows.map((row) => {
      const effectiveDifficulty =
        row.tick.difficulty ?? (row.consensusDifficulty != null ? Math.round(row.consensusDifficulty) : null);
      const effectiveDifficultyName =
        row.difficultyName || (effectiveDifficulty != null ? getGradeLabel(effectiveDifficulty) : null) || null;
      return {
        uuid: row.tick.uuid,
        userId: row.tick.userId,
        climbUuid: row.tick.climbUuid,
        climbName: row.climbName || null,
        boardType: row.tick.boardType,
        layoutId: row.layoutId,
        angle: row.tick.angle,
        status: row.tick.status,
        attemptCount: row.tick.attemptCount,
        difficulty: effectiveDifficulty,
        difficultyName: effectiveDifficultyName,
        quality: row.tick.quality,
        isMirror: row.tick.isMirror ?? false,
        isBenchmark: row.tick.isBenchmark ?? false,
        isNoMatch: isNoMatchClimb(row.climbDescription),
        comment: row.tick.comment || null,
        frames: row.frames || null,
        setterUsername: row.setterUsername || null,
        climbedAt: row.tick.climbedAt,
        upvotes: tickVoteMap.get(row.tick.uuid) ?? 0,
        totalAttempts: null,
      };
    });

    // Compute totalAttempts for each tick: sum of attemptCount since last
    // successful ascent (flash/send) by the same user on the same climb.
    // Build unique combos of (userId, climbUuid, boardType, angle) from ticks
    const comboSet = new Set<string>();
    const comboValues: Array<{
      userId: string;
      climbUuid: string;
      boardType: string;
      angle: number;
    }> = [];
    for (const row of tickRows) {
      const key = `${row.tick.userId}|${row.tick.climbUuid}|${row.tick.boardType}|${row.tick.angle}`;
      if (!comboSet.has(key)) {
        comboSet.add(key);
        comboValues.push({
          userId: row.tick.userId,
          climbUuid: row.tick.climbUuid,
          boardType: row.tick.boardType,
          angle: row.tick.angle,
        });
      }
    }

    if (comboValues.length > 0) {
      // Build VALUES clause for the combos
      const valuesSql = sql.join(
        comboValues.map((c) => sql`(${c.userId}, ${c.climbUuid}, ${c.boardType}, ${c.angle})`),
        sql`, `,
      );

      const totalAttemptsResult = await dbRead.execute(sql`
        WITH combos(user_id, climb_uuid, board_type, angle) AS (
          VALUES ${valuesSql}
        ),
        last_success AS (
          SELECT
            t.user_id,
            t.climb_uuid,
            t.board_type,
            t.angle,
            MAX(t.climbed_at) AS last_success_at
          FROM boardsesh_ticks t
          INNER JOIN combos c
            ON t.user_id = c.user_id
            AND t.climb_uuid = c.climb_uuid
            AND t.board_type = c.board_type
            AND t.angle = c.angle::int
          WHERE t.status IN ('flash', 'send')
          GROUP BY t.user_id, t.climb_uuid, t.board_type, t.angle
        ),
        attempts_since AS (
          SELECT
            t.user_id,
            t.climb_uuid,
            t.board_type,
            t.angle,
            SUM(t.attempt_count)::int AS total
          FROM boardsesh_ticks t
          INNER JOIN combos c
            ON t.user_id = c.user_id
            AND t.climb_uuid = c.climb_uuid
            AND t.board_type = c.board_type
            AND t.angle = c.angle::int
          LEFT JOIN last_success ls
            ON t.user_id = ls.user_id
            AND t.climb_uuid = ls.climb_uuid
            AND t.board_type = ls.board_type
            AND t.angle = ls.angle
          WHERE t.climbed_at >= COALESCE(ls.last_success_at, '1970-01-01'::timestamp)
          GROUP BY t.user_id, t.climb_uuid, t.board_type, t.angle
        )
        SELECT * FROM attempts_since
      `);

      const attemptsRows = rowsFromResult<{
        user_id: string;
        climb_uuid: string;
        board_type: string;
        angle: number;
        total: number;
      }>(totalAttemptsResult);

      // Build lookup map
      const attemptsMap = new Map<string, number>();
      for (const r of attemptsRows) {
        attemptsMap.set(`${r.user_id}|${r.climb_uuid}|${r.board_type}|${r.angle}`, r.total);
      }

      // Attach totalAttempts to each tick
      for (const tick of ticks) {
        const key = `${tick.userId}|${tick.climbUuid}|${tick.boardType}|${tick.angle}`;
        tick.totalAttempts = attemptsMap.get(key) ?? null;
      }
    }

    // Compute aggregates
    const userIds = [...new Set(tickRows.map((r) => r.tick.userId))];
    const boardTypes = [...new Set(tickRows.map((r) => r.tick.boardType))];

    const { totalSends, totalFlashes, totalAttempts } = computeSessionAggregates(tickRows);

    const participants = await fetchParticipants(sessionId, userIds);
    const gradeDistribution = buildGradeDistributionFromTicks(tickRows);

    // Timestamps
    const sortedTicks = [...tickRows].sort(
      (a, b) => new Date(a.tick.climbedAt).getTime() - new Date(b.tick.climbedAt).getTime(),
    );
    const firstTickAt = sortedTicks[0].tick.climbedAt;
    const lastTickAt = sortedTicks[sortedTicks.length - 1].tick.climbedAt;
    const durationMinutes =
      Math.round((new Date(lastTickAt).getTime() - new Date(firstTickAt).getTime()) / 60000) || null;

    // Hardest grade (use effective difficulty with consensus fallback)
    const gradesSorted = tickRows
      .map((r) => {
        const effDiff = r.tick.difficulty ?? (r.consensusDifficulty != null ? Math.round(r.consensusDifficulty) : null);
        const effName = r.difficultyName || (effDiff != null ? getGradeLabel(effDiff) : null) || null;
        return { ...r, effDiff, effName };
      })
      .filter((r) => r.effName && (r.tick.status === 'flash' || r.tick.status === 'send'))
      .sort((a, b) => (b.effDiff ?? 0) - (a.effDiff ?? 0));
    const hardestGrade = gradesSorted.length > 0 ? gradesSorted[0].effName : null;

    // Vote/comment counts
    const [voteData] = await dbRead
      .select({
        upvotes: sql<number>`COALESCE(upvotes, 0)`,
        downvotes: sql<number>`COALESCE(downvotes, 0)`,
        score: sql<number>`COALESCE(score, 0)`,
      })
      .from(dbSchema.voteCounts)
      .where(and(sql`${dbSchema.voteCounts.entityType} = 'session'`, eq(dbSchema.voteCounts.entityId, sessionId)))
      .limit(1);

    const [commentData] = await dbRead
      .select({ count: drizzleCount() })
      .from(dbSchema.comments)
      .where(
        and(
          sql`${dbSchema.comments.entityType} = 'session'`,
          eq(dbSchema.comments.entityId, sessionId),
          isNull(dbSchema.comments.deletedAt),
        ),
      );

    // Session metadata
    const sessionName = partySession.name || null;
    const goal = partySession.goal || null;
    const ownerUserId = partySession.createdByUserId || null;
    const viewerUserId = ctx?.isAuthenticated ? (ctx.userId ?? null) : null;
    const [healthKitWorkout] = viewerUserId
      ? await dbRead
          .select({ workoutId: dbSchema.sessionHealthKitWorkouts.workoutId })
          .from(dbSchema.sessionHealthKitWorkouts)
          .where(
            and(
              eq(dbSchema.sessionHealthKitWorkouts.sessionId, sessionId),
              eq(dbSchema.sessionHealthKitWorkouts.userId, viewerUserId),
            ),
          )
          .limit(1)
      : [];

    return {
      sessionId,
      sessionType: 'party',
      sessionName,
      ownerUserId,
      participants,
      totalSends,
      totalFlashes,
      totalAttempts,
      tickCount: tickRows.length,
      gradeDistribution,
      boardTypes,
      hardestGrade,
      firstTickAt,
      lastTickAt,
      durationMinutes,
      goal,
      ticks,
      upvotes: voteData ? Number(voteData.upvotes) : 0,
      downvotes: voteData ? Number(voteData.downvotes) : 0,
      voteScore: voteData ? Number(voteData.score) : 0,
      commentCount: commentData ? Number(commentData.count) : 0,
      healthKitWorkoutId: healthKitWorkout?.workoutId ?? null,
    };
  },
};

/**
 * Fetch participant info for a session
 */
async function fetchParticipants(sessionId: string, userIds: string[]): Promise<SessionFeedParticipant[]> {
  if (userIds.length === 0) return [];

  const participantRows = await dbRead.execute(sql`
    SELECT
      t.user_id AS "userId",
      COALESCE(up.display_name, u.name) AS "displayName",
      COALESCE(up.avatar_url, u.image) AS "avatarUrl",
      COUNT(*) FILTER (WHERE t.status IN ('flash', 'send'))::int AS sends,
      COUNT(*) FILTER (WHERE t.status = 'flash')::int AS flashes,
      (
        COALESCE(SUM(GREATEST(t.attempt_count - 1, 0)) FILTER (WHERE t.status = 'send'), 0)
        + COALESCE(SUM(t.attempt_count) FILTER (WHERE t.status = 'attempt'), 0)
      )::int AS attempts
    FROM boardsesh_ticks t
    LEFT JOIN users u ON u.id = t.user_id
    LEFT JOIN user_profiles up ON up.user_id = t.user_id
    WHERE t.session_id = ${sessionId}
    GROUP BY t.user_id, up.display_name, u.name, up.avatar_url, u.image
    ORDER BY sends DESC
  `);

  const participantArray = rowsFromResult<{
    userId: string;
    displayName: string | null;
    avatarUrl: string | null;
    sends: number;
    flashes: number;
    attempts: number;
  }>(participantRows);
  return participantArray.map((r) => ({
    userId: r.userId,
    displayName: r.displayName,
    avatarUrl: r.avatarUrl,
    sends: r.sends,
    flashes: r.flashes,
    attempts: r.attempts,
  }));
}

// buildGradeDistributionFromTicks and computeSessionAggregates are imported from ./session-feed-utils

// ============================================
// Batched enrichment functions for feed (3 queries instead of 3×N)
// ============================================

/**
 * Fetch participants for multiple sessions in a single query.
 * Returns a Map from sessionId to participants array.
 */
async function fetchParticipantsBatch(
  sessionIds: string[],
  { boardTypeFilter, layoutIdFilter }: SessionFeedFilterOptions,
): Promise<Map<string, SessionFeedParticipant[]>> {
  if (sessionIds.length === 0) return new Map();

  // Resolve dedup-merged climbs to their canonical UUID before the layout join
  // so aliased ticks aren't dropped from a layout-filtered participant count.
  const batchLayoutJoin =
    layoutIdFilter !== null
      ? sql`LEFT JOIN board_climb_aliases bca ON bca.board_type = t.board_type AND bca.alias_uuid = t.climb_uuid LEFT JOIN board_climbs cf ON cf.uuid = COALESCE(bca.canonical_uuid, t.climb_uuid) AND cf.board_type = t.board_type`
      : sql``;
  const batchBoardFilter = boardTypeFilter ? sql`AND t.board_type = ${boardTypeFilter}` : sql``;
  const batchLayoutFilter = layoutIdFilter !== null ? sql`AND cf.layout_id = ${layoutIdFilter}` : sql``;

  const result = await dbRead.execute(sql`
    SELECT
      t.session_id,
      t.user_id AS "userId",
      COALESCE(up.display_name, u.name) AS "displayName",
      COALESCE(up.avatar_url, u.image) AS "avatarUrl",
      COUNT(*) FILTER (WHERE t.status IN ('flash', 'send'))::int AS sends,
      COUNT(*) FILTER (WHERE t.status = 'flash')::int AS flashes,
      (
        COALESCE(SUM(GREATEST(t.attempt_count - 1, 0)) FILTER (WHERE t.status = 'send'), 0)
        + COALESCE(SUM(t.attempt_count) FILTER (WHERE t.status = 'attempt'), 0)
      )::int AS attempts
    FROM boardsesh_ticks t
    ${batchLayoutJoin}
    LEFT JOIN users u ON u.id = t.user_id
    LEFT JOIN user_profiles up ON up.user_id = t.user_id
    WHERE t.session_id IN ${sql`(${sql.join(
      sessionIds.map((id) => sql`${id}`),
      sql`, `,
    )})`}
      ${batchBoardFilter}
      ${batchLayoutFilter}
    GROUP BY t.session_id, t.user_id, up.display_name, u.name, up.avatar_url, u.image
    ORDER BY sends DESC
  `);

  const rows = rowsFromResult<{
    session_id: string;
    userId: string;
    displayName: string | null;
    avatarUrl: string | null;
    sends: number;
    flashes: number;
    attempts: number;
  }>(result);

  const map = new Map<string, SessionFeedParticipant[]>();
  for (const r of rows) {
    const participants = map.get(r.session_id) ?? [];
    participants.push({
      userId: r.userId,
      displayName: r.displayName,
      avatarUrl: r.avatarUrl,
      sends: r.sends,
      flashes: r.flashes,
      attempts: r.attempts,
    });
    map.set(r.session_id, participants);
  }
  return map;
}

/**
 * Fetch grade distributions for multiple sessions in a single query.
 * Returns a Map from sessionId to grade distribution array.
 */
async function fetchGradeDistributionBatch(
  sessionIds: string[],
  { boardTypeFilter, layoutIdFilter }: SessionFeedFilterOptions,
): Promise<Map<string, SessionGradeDistributionItem[]>> {
  if (sessionIds.length === 0) return new Map();

  // Resolve dedup-merged climbs to their canonical UUID before the layout join
  // so aliased ticks aren't dropped from a layout-filtered distribution.
  const batchLayoutJoin =
    layoutIdFilter !== null
      ? sql`LEFT JOIN board_climbs cf ON cf.uuid = COALESCE(bca.canonical_uuid, t.climb_uuid) AND cf.board_type = t.board_type`
      : sql``;
  const batchBoardFilter = boardTypeFilter ? sql`AND t.board_type = ${boardTypeFilter}` : sql``;
  const batchLayoutFilter = layoutIdFilter !== null ? sql`AND cf.layout_id = ${layoutIdFilter}` : sql``;

  const result = await dbRead.execute(sql`
    SELECT
      t.session_id,
      COALESCE(t.difficulty, ROUND(bcs.display_difficulty)::int) AS diff_num,
      COUNT(*) FILTER (WHERE t.status = 'flash')::int AS flash,
      COUNT(*) FILTER (WHERE t.status = 'send')::int AS send,
      (
        COALESCE(SUM(GREATEST(t.attempt_count - 1, 0)) FILTER (WHERE t.status = 'send'), 0)
        + COALESCE(SUM(t.attempt_count) FILTER (WHERE t.status = 'attempt'), 0)
      )::int AS attempt
    FROM boardsesh_ticks t
    -- Alias hop shared by both the layout filter and the consensus-grade stats
    -- join below: a tick on a deduped-away alias UUID has its board_climbs row
    -- and its board_climb_stats on the canonical, so resolve before both joins.
    LEFT JOIN board_climb_aliases bca ON bca.board_type = t.board_type AND bca.alias_uuid = t.climb_uuid
    ${batchLayoutJoin}
    LEFT JOIN board_climb_stats bcs ON bcs.climb_uuid = COALESCE(bca.canonical_uuid, t.climb_uuid) AND bcs.board_type = t.board_type AND bcs.angle = t.angle
    WHERE t.session_id IN ${sql`(${sql.join(
      sessionIds.map((id) => sql`${id}`),
      sql`, `,
    )})`}
      ${batchBoardFilter}
      ${batchLayoutFilter}
      AND COALESCE(t.difficulty, ROUND(bcs.display_difficulty)::int) IS NOT NULL
    GROUP BY t.session_id, diff_num
    ORDER BY diff_num DESC
  `);

  const rows = rowsFromResult<{
    session_id: string;
    diff_num: number;
    flash: number;
    send: number;
    attempt: number;
  }>(result);

  const map = new Map<string, SessionGradeDistributionItem[]>();
  for (const r of rows) {
    const grade = getGradeLabel(r.diff_num);
    if (!grade) continue;
    const distribution = map.get(r.session_id) ?? [];
    distribution.push({ grade, flash: r.flash, send: r.send, attempt: r.attempt });
    map.set(r.session_id, distribution);
  }
  return map;
}

/**
 * Fetch session metadata (name, goal, ownerUserId) for multiple sessions.
 * Returns a Map from sessionId to metadata.
 */
async function fetchSessionMetaBatch(
  sessionIds: string[],
): Promise<Map<string, { name: string | null; goal: string | null; ownerUserId: string | null }>> {
  if (sessionIds.length === 0) return new Map();

  const map = new Map<string, { name: string | null; goal: string | null; ownerUserId: string | null }>();

  const partyRows = await dbRead
    .select({
      id: dbSchema.boardSessions.id,
      name: dbSchema.boardSessions.name,
      goal: dbSchema.boardSessions.goal,
      createdByUserId: dbSchema.boardSessions.createdByUserId,
    })
    .from(dbSchema.boardSessions)
    .where(inArray(dbSchema.boardSessions.id, sessionIds));

  for (const r of partyRows) {
    map.set(r.id, { name: r.name, goal: r.goal, ownerUserId: r.createdByUserId });
  }

  return map;
}

/**
 * Fetch distinct board types for multiple sessions in a single query.
 * Returns a Map from sessionId to board types array.
 */
async function fetchBoardTypesBatch(
  sessionIds: string[],
  { boardTypeFilter, layoutIdFilter }: SessionFeedFilterOptions,
): Promise<Map<string, string[]>> {
  if (sessionIds.length === 0) return new Map();

  // Resolve dedup-merged climbs to their canonical UUID before the layout join
  // so aliased ticks aren't dropped from a layout-filtered board-type roll-up.
  const batchLayoutJoin =
    layoutIdFilter !== null
      ? sql`LEFT JOIN board_climb_aliases bca ON bca.board_type = t.board_type AND bca.alias_uuid = t.climb_uuid LEFT JOIN board_climbs cf ON cf.uuid = COALESCE(bca.canonical_uuid, t.climb_uuid) AND cf.board_type = t.board_type`
      : sql``;
  const batchBoardFilter = boardTypeFilter ? sql`AND t.board_type = ${boardTypeFilter}` : sql``;
  const batchLayoutFilter = layoutIdFilter !== null ? sql`AND cf.layout_id = ${layoutIdFilter}` : sql``;

  const result = await dbRead.execute(sql`
    SELECT
      t.session_id,
      ARRAY_AGG(DISTINCT t.board_type) AS board_types
    FROM boardsesh_ticks t
    ${batchLayoutJoin}
    WHERE t.session_id IN ${sql`(${sql.join(
      sessionIds.map((id) => sql`${id}`),
      sql`, `,
    )})`}
      ${batchBoardFilter}
      ${batchLayoutFilter}
    GROUP BY t.session_id
  `);

  const rows = rowsFromResult<{
    session_id: string;
    board_types: string[];
  }>(result);

  const map = new Map<string, string[]>();
  for (const r of rows) {
    map.set(r.session_id, r.board_types);
  }
  return map;
}
