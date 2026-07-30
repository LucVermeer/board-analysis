import { eq, and, asc, sql } from 'drizzle-orm';
import { type ConnectionContext, type Climb, type BoardName, SUPPORTED_BOARDS } from '@boardsesh/shared-schema';
import { isSizeScopedBoard, parseSetIds } from '@boardsesh/board-config';
import { db } from '../../../../db/client';
import * as dbSchema from '@boardsesh/db/schema';
import { validateInput } from '../../shared/helpers';
import { GetPlaylistClimbsInputSchema } from '../../../../validation/schemas';
import { UNIFIED_TABLES, isValidBoardName } from '../../../../db/queries/util/table-select';
import { verifyPlaylistAccess } from '../helpers/enrichment';
import { hydrateClimbsByRefs } from '../helpers/hydrate-climbs';

export type PlaylistClimbsInput = {
  playlistId: string;
  boardName?: string;
  layoutId?: number;
  sizeId?: number;
  setIds?: string;
  angle?: number;
  // All-boards mode only: render on-active-board climbs at the user's selected
  // angle instead of the added-at / most-ascents fallback.
  activeBoardName?: string;
  activeAngle?: number;
  page?: number;
  pageSize?: number;
};

function paginateResults<T>(results: T[], pageSize: number) {
  const hasMore = results.length > pageSize;
  return { items: hasMore ? results.slice(0, pageSize) : results, hasMore };
}

/**
 * Specific-board mode: fetch climbs filtered by board type, layout, and size edges.
 *
 * Same two-step shape as the all-boards path: read the page of refs from
 * playlistClimbs (with the board/layout/size filters on the join), then hand
 * them to the shared hydrator, which joins stats/grades at the requested angle
 * and falls back to the most-ascended angle when the climb has no stats there
 * — so the selected angle never blanks a grade.
 */
async function fetchSpecificBoardClimbs(
  playlistId: bigint,
  input: PlaylistClimbsInput,
  page: number,
  pageSize: number,
): Promise<{ climbs: Climb[]; hasMore: boolean }> {
  const boardName = input.boardName as BoardName;
  if (!isValidBoardName(boardName)) {
    throw new Error(`Invalid board name: ${String(boardName)}. Must be one of: ${SUPPORTED_BOARDS.join(', ')}`);
  }

  const tables = UNIFIED_TABLES;

  // Build climb join conditions
  const climbJoinConditions = [
    eq(tables.climbs.uuid, dbSchema.playlistClimbs.climbUuid),
    eq(tables.climbs.boardType, boardName),
  ];

  if (input.layoutId != null) {
    climbJoinConditions.push(eq(tables.climbs.layoutId, input.layoutId));
  }

  // Size-scope the join only for boards that actually have size variants.
  // MoonBoard has one fixed product size, so its climbs carry NULL
  // `compatible_size_ids` — and `sizeId = ANY(NULL)` is NULL, never true, which
  // silently dropped every MoonBoard row from this join (#3891). `isSizeScopedBoard`
  // is the one guard for that; the sibling call sites are the main climb search
  // (`create-climb-filters.ts`) and the sync pull (`sync/queries.ts`). Array
  // containment (`@>`) rather than `= ANY` so the existing
  // board_climbs_compatible_size_ids_idx GIN index applies, matching those callers.
  if (input.sizeId != null && isSizeScopedBoard(boardName)) {
    climbJoinConditions.push(sql`${tables.climbs.compatibleSizeIds} @> ARRAY[${input.sizeId}]::int[]`);
  }

  // Hold-set scoping, the same `required_set_ids <@ selected sets` containment the
  // main climb search applies (`create-climb-filters.ts`). Dropping the broken size
  // predicate for MoonBoard is what finally let MoonBoard rows through this join, and
  // MoonBoard is exactly the board whose optional wooden / screw-on add-on sets are
  // encoded in `required_set_ids` — without this, a wall built without those sets
  // hands the play drawer climbs it cannot light in full.
  //
  // NULL is tolerated on every board here, where search only tolerates it for
  // MoonBoard and drafts: `required_set_ids` is denormalised and backfilled
  // asynchronously, and a playlist is a list the climber curated by hand. Missing
  // provenance should not make one of their own climbs disappear — only a climb we
  // positively know needs an uninstalled set is dropped. The blast radius of the
  // more permissive choice is small: in prod (2026-07-31) 1,223 of 408,035 Kilter
  // climbs (0.30%) and 776 of 153,370 Tension climbs (0.51%) still have a NULL
  // `required_set_ids`, so at most half a percent of Aurora playlist rows keep the
  // pre-#3891 behaviour, versus every one of them disappearing on a backfill lag.
  const selectedSetIds = input.setIds == null ? [] : parseSetIds(input.setIds);
  if (selectedSetIds.length > 0) {
    climbJoinConditions.push(
      sql`(${tables.climbs.requiredSetIds} IS NULL OR ${tables.climbs.requiredSetIds} <@ ARRAY[${sql.join(
        selectedSetIds.map((setId) => sql`${setId}`),
        sql`, `,
      )}]::int[])`,
    );
  }

  const refRows = await db
    .select({
      climbUuid: dbSchema.playlistClimbs.climbUuid,
      playlistAngle: dbSchema.playlistClimbs.angle,
    })
    .from(dbSchema.playlistClimbs)
    .innerJoin(tables.climbs, and(...climbJoinConditions))
    .where(eq(dbSchema.playlistClimbs.playlistId, playlistId))
    .orderBy(asc(dbSchema.playlistClimbs.position), asc(dbSchema.playlistClimbs.addedAt))
    .limit(pageSize + 1)
    .offset(page * pageSize);

  const { items, hasMore } = paginateResults(refRows, pageSize);

  // The caller's angle (the wall the user is on) wins; a climb's added-at
  // angle is the secondary signal, mirroring the all-boards path.
  const angleOverrides = new Map<string, number | null>();
  for (const row of items) {
    angleOverrides.set(`${boardName}:${row.climbUuid}`, input.angle ?? row.playlistAngle ?? null);
  }

  const climbs = await hydrateClimbsByRefs(
    items.map((row) => ({ climbUuid: row.climbUuid, boardType: boardName })),
    { angleOverrides },
  );

  return { climbs, hasMore };
}

/**
 * All-boards mode: fetch climbs across all board types.
 *
 * Two-step: first read the page of refs (uuid + boardType + per-row angle
 * override) from playlistClimbs in position order, then hand them to the
 * shared hydrator which owns the climbs/climbStats join. Lets schema changes
 * to climbStats live in exactly one file (`helpers/hydrate-climbs.ts`).
 */
async function fetchAllBoardsClimbs(
  playlistId: bigint,
  input: PlaylistClimbsInput,
  page: number,
  pageSize: number,
): Promise<{ climbs: Climb[]; hasMore: boolean }> {
  const tables = UNIFIED_TABLES;

  const refRows = await db
    .select({
      climbUuid: dbSchema.playlistClimbs.climbUuid,
      boardType: tables.climbs.boardType,
      playlistAngle: dbSchema.playlistClimbs.angle,
    })
    .from(dbSchema.playlistClimbs)
    .innerJoin(tables.climbs, eq(tables.climbs.uuid, dbSchema.playlistClimbs.climbUuid))
    .where(eq(dbSchema.playlistClimbs.playlistId, playlistId))
    .orderBy(asc(dbSchema.playlistClimbs.position), asc(dbSchema.playlistClimbs.addedAt))
    .limit(pageSize + 1)
    .offset(page * pageSize);

  const { items, hasMore } = paginateResults(refRows, pageSize);

  // Climbs on the active board render their grade at the user's selected angle;
  // every other climb keeps its added-at angle (most-ascents when null). The
  // hydrator drops back to most-ascents if a climb has no stats at the override
  // angle, so the selected angle never blanks a grade.
  const { activeBoardName, activeAngle } = input;
  const angleOverrides = new Map<string, number | null>();
  for (const row of items) {
    const useActiveAngle = activeBoardName != null && activeAngle != null && row.boardType === activeBoardName;
    angleOverrides.set(`${row.boardType}:${row.climbUuid}`, useActiveAngle ? activeAngle : (row.playlistAngle ?? null));
  }

  const climbs = await hydrateClimbsByRefs(
    items.map((row) => ({ climbUuid: row.climbUuid, boardType: row.boardType })),
    { angleOverrides },
  );

  return { climbs, hasMore };
}

/**
 * Get climbs in a playlist with full climb data.
 * Supports specific-board mode (boardName provided) or all-boards mode (boardName omitted).
 */
export const playlistClimbs = async (
  _: unknown,
  { input }: { input: PlaylistClimbsInput },
  ctx: ConnectionContext,
): Promise<{ climbs: Climb[]; totalCount: number; hasMore: boolean }> => {
  validateInput(GetPlaylistClimbsInputSchema, input, 'input');

  const page = input.page ?? 0;
  const pageSize = input.pageSize ?? 20;

  // Verify access (throws if denied)
  const playlistId = await verifyPlaylistAccess(input.playlistId, ctx.userId ?? null);

  // Get total count
  const countResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(dbSchema.playlistClimbs)
    .where(eq(dbSchema.playlistClimbs.playlistId, playlistId));

  const totalCount = countResult[0]?.count || 0;

  if (input.boardName) {
    const { climbs, hasMore } = await fetchSpecificBoardClimbs(playlistId, input, page, pageSize);
    return { climbs, totalCount, hasMore };
  } else {
    const { climbs, hasMore } = await fetchAllBoardsClimbs(playlistId, input, page, pageSize);
    return { climbs, totalCount, hasMore };
  }
};
