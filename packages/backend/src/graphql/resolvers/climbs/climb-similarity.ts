import { sql } from 'drizzle-orm';
import * as dbSchema from '@boardsesh/db/schema';
import { STATE_TO_PRIMARY_CODE, convertLitUpHoldsStringToMap } from '@boardsesh/board-constants/hold-states';
import type { BoardName } from '@boardsesh/board-constants';
import { executeRows } from '@boardsesh/db/client';
import { db } from '../../../db/client';

export type NormalizedHold = {
  holdId: number;
  holdState: string;
};

export type NormalizedHoldRow = NormalizedHold & {
  frameNumber: number;
};

export type ExactDuplicateMatch = {
  uuid: string;
  name: string | null;
  setterUsername: string | null;
  angle: number | null;
};

export type SimilarClimbResult = {
  uuid: string;
  name: string | null;
  setterUsername: string | null;
  angle: number | null;
  layoutId: number;
  frames: string | null;
  difficultyName: string | null;
  qualityAverage: number | null;
  ascensionistCount: number | null;
  compatibleSizeIds: number[];
  similarity: number;
  sharedHoldCount: number;
  candidateHoldCount: number;
  targetHoldCount: number;
};

// `parseFramesToHoldEntries` drops the synthetic "<holdId>=<code>" sentinel
// produced by `convertLitUpHoldsStringToMap` for unmapped role codes, so the
// candidate signature never carries those. The DB, on the other hand, can
// persist any hold_state value Aurora emits — including future codes that
// HOLD_STATE_MAP doesn't know about yet. Without filtering the SQL to the
// same canonical set, an existing climb with one extra unknown-state row
// would produce a longer signature, miss the candidate's, and silently let
// a real duplicate through. We derive the set at module load from
// STATE_TO_PRIMARY_CODE rather than hand-coding it so that adding a new
// canonical climb state to board-constants automatically widens the gate.
const KNOWN_HOLD_STATES: ReadonlyArray<string> = Array.from(
  new Set(Object.values(STATE_TO_PRIMARY_CODE).flatMap((perBoard) => Object.keys(perBoard))),
).sort();
const KNOWN_HOLD_STATES_SQL = sql`(${sql.join(
  KNOWN_HOLD_STATES.map((state) => sql`${state}`),
  sql`, `,
)})`;

/**
 * Parse the Aurora-style frame string ("p<id>r<role>p<id>r<role>...,p<id>r<role>...")
 * into a flat list of holds with their state name. Multi-frame strings (comma
 * separated) are flattened with the frame index preserved.
 *
 * Returns only holds whose state code resolves to a named state (STARTING /
 * HAND / FINISH / FOOT) — unknown codes (the synthetic "1=42" sentinel) are
 * dropped so they can't poison signatures.
 */
export function parseFramesToHoldEntries(boardType: BoardName, frames: string | null | undefined): NormalizedHoldRow[] {
  if (!frames) return [];
  const frameMap = convertLitUpHoldsStringToMap(frames, boardType);
  const rows: NormalizedHoldRow[] = [];
  for (const [frameIndexKey, holdsMap] of Object.entries(frameMap)) {
    const frameNumber = Number(frameIndexKey);
    for (const [holdIdKey, hold] of Object.entries(holdsMap)) {
      if (!hold.state || hold.state.includes('=')) continue;
      const holdId = Number(holdIdKey);
      if (!Number.isFinite(holdId)) continue;
      rows.push({ frameNumber, holdId, holdState: hold.state });
    }
  }
  return rows;
}

/**
 * Build the canonical signature used to detect exact-match duplicates. Sorts
 * by hold id so two callers describing the same hold set in different order
 * produce identical signatures.
 *
 * Frame number is intentionally NOT part of the signature: the gate only
 * applies to single-frame climbs, and the SQL side also restricts to
 * frames_count = 1.
 */
export function buildHoldSignature(entries: ReadonlyArray<NormalizedHold>): string {
  if (entries.length === 0) return '';
  // First-write-wins to match what the DB persists. board_climb_holds has a
  // PK on (board_type, climb_uuid, hold_id) and saveClimb/saveMoonBoardClimb
  // both INSERT ... ON CONFLICT DO NOTHING — so when malformed frames text
  // (e.g. "p1r12p1r13") presents the same hold_id twice in a single frame,
  // the FIRST occurrence is the one that lands. If the JS signature used
  // last-write-wins it would compute "1:HAND" while the DB row reads
  // "1:STARTING", silently breaking the gate's hold-set equality check.
  const dedupedByHoldId = new Map<number, string>();
  for (const { holdId, holdState } of entries) {
    if (!dedupedByHoldId.has(holdId)) {
      dedupedByHoldId.set(holdId, holdState);
    }
  }
  return Array.from(dedupedByHoldId.entries())
    .sort(([a], [b]) => a - b)
    .map(([holdId, holdState]) => `${holdId}:${holdState}`)
    .join(',');
}

type FindExactDuplicateArgs = {
  boardType: BoardName;
  layoutId: number;
  signature: string;
  excludeUuid?: string;
};

/**
 * Look up a published, single-frame climb on the same board+layout whose set
 * of (hold_id, hold_state) tuples produces the same signature.
 *
 * Returns the most prominent match (highest ascensionist count, then uuid)
 * when several exist, so the error message points at the canonical version.
 */
export async function findExactDuplicateMatch({
  boardType,
  layoutId,
  signature,
  excludeUuid,
}: FindExactDuplicateArgs): Promise<ExactDuplicateMatch | null> {
  if (!signature) return null;

  const rows = await executeRows<{
    uuid: string;
    name: string | null;
    setter_username: string | null;
    angle: number | null;
  }>(
    db,
    sql`
      SELECT
        ${dbSchema.boardClimbs.uuid} AS uuid,
        ${dbSchema.boardClimbs.name} AS name,
        ${dbSchema.boardClimbs.setterUsername} AS setter_username,
        ${dbSchema.boardClimbs.angle} AS angle
      FROM ${dbSchema.boardClimbs}
      INNER JOIN ${dbSchema.boardClimbHolds}
        ON ${dbSchema.boardClimbHolds.climbUuid} = ${dbSchema.boardClimbs.uuid}
       AND ${dbSchema.boardClimbHolds.boardType} = ${dbSchema.boardClimbs.boardType}
       AND ${dbSchema.boardClimbHolds.holdState} IN ${KNOWN_HOLD_STATES_SQL}
      LEFT JOIN ${dbSchema.boardClimbStats}
        ON ${dbSchema.boardClimbStats.boardType} = ${dbSchema.boardClimbs.boardType}
       AND ${dbSchema.boardClimbStats.climbUuid} = ${dbSchema.boardClimbs.uuid}
       AND ${dbSchema.boardClimbStats.angle} = ${dbSchema.boardClimbs.angle}
      WHERE ${dbSchema.boardClimbs.boardType} = ${boardType}
        AND ${dbSchema.boardClimbs.layoutId} = ${layoutId}
        AND ${dbSchema.boardClimbs.isDraft} = FALSE
        AND ${dbSchema.boardClimbs.isListed} IS NOT FALSE
        AND ${dbSchema.boardClimbs.framesCount} = 1
        ${excludeUuid ? sql`AND ${dbSchema.boardClimbs.uuid} <> ${excludeUuid}` : sql``}
      GROUP BY
        ${dbSchema.boardClimbs.uuid},
        ${dbSchema.boardClimbs.name},
        ${dbSchema.boardClimbs.setterUsername},
        ${dbSchema.boardClimbs.angle}
      HAVING string_agg(
        ${dbSchema.boardClimbHolds.holdId}::text || ':' || ${dbSchema.boardClimbHolds.holdState},
        ',' ORDER BY ${dbSchema.boardClimbHolds.holdId}
      ) = ${signature}
      -- Aggregate ascensionist_count rather than grouping by it so we
      -- depend solely on the PK uniqueness of board_climbs.uuid for
      -- per-climb grouping. board_climb_stats.PK is (boardType, climbUuid,
      -- angle) so each (uuid, angle) join row contributes one stats row at
      -- most today, but expressing it as MAX() keeps the query correct if
      -- the schema ever grows additional stats per climb.
      ORDER BY MAX(COALESCE(${dbSchema.boardClimbStats.ascensionistCount}, 0)) DESC, ${dbSchema.boardClimbs.uuid} ASC
      LIMIT 1
    `,
  );

  const match = rows[0];
  if (!match) return null;
  return {
    uuid: match.uuid,
    name: match.name,
    setterUsername: match.setter_username,
    angle: match.angle,
  };
}

type FindSimilarClimbsArgs = {
  boardType: BoardName;
  layoutId: number;
  holds: ReadonlyArray<NormalizedHold>;
  threshold: number;
  excludeUuid?: string;
  limit?: number;
  /** Viewer angle. When set, joins board_climb_stats on this angle so each
   *  candidate's grade/quality/ascents reflect the angle the viewer is on.
   *  When omitted, falls back to each candidate's own saved angle. */
  statsAngle?: number;
};

/**
 * Find published climbs on the same board+layout that share at least
 * `threshold` Jaccard similarity over hold positions (hold_id only).
 *
 * Why position-only rather than (hold_id, hold_state)?
 * An extended-start variant re-roles the original's start/foot holds into
 * mid-route hand moves (e.g. cucumber ↔ pickled cucumbers: 9 positions
 * shared, 3 of those flip STARTING/FOOT → HAND). Under state-aware Jaccard
 * those climbs scored 0.40 — below the discovery threshold and unintuitive
 * to anyone looking at the wall. Position-only scoring catches extended
 * variants, foot-only edits, and other re-rolings while staying simple.
 *
 * The duplicate gate (`findExactDuplicateMatch`) is unchanged — there the
 * state-aware signature is correct: a climb with the same positions but
 * different roles is a *different* climb, not a duplicate.
 *
 * Single-frame only — multi-frame Aurora climbs are excluded to keep the
 * definition simple and the result set meaningful.
 */
export async function findSimilarClimbs({
  boardType,
  layoutId,
  holds,
  threshold,
  excludeUuid,
  limit = 25,
  statsAngle,
}: FindSimilarClimbsArgs): Promise<SimilarClimbResult[]> {
  // Reduce to unique hold positions on the target. State is intentionally
  // dropped — see the docblock above.
  const targetHoldIds = Array.from(new Set(holds.map(({ holdId }) => holdId)));
  if (targetHoldIds.length === 0) return [];

  const targetSize = targetHoldIds.length;
  const safeThreshold = Math.max(0, Math.min(1, threshold));
  const safeLimit = Math.max(1, Math.min(200, limit));
  const targetHoldIdsJson = JSON.stringify(targetHoldIds);

  const rows = await executeRows<{
    uuid: string;
    name: string | null;
    setter_username: string | null;
    angle: number | null;
    layout_id: number;
    frames: string | null;
    difficulty_name: string | null;
    quality_average: number | null;
    ascensionist_count: number | null;
    compatible_size_ids: number[] | null;
    shared: number;
    candidate_hold_count: number;
    jaccard: number;
  }>(
    db,
    sql`
      WITH target_holds AS (
        SELECT (value)::int AS hold_id
        FROM jsonb_array_elements(${targetHoldIdsJson}::jsonb) AS value
      ),
      -- The (board_type, hold_id) join below is index-supported by the
      -- leading two columns of board_climb_holds_search_idx
      -- (board_type, hold_id, hold_state) — see unified.ts:396. Postgres
      -- treats the (hold_state IN …) filter as a residual on the index
      -- entries and never falls back to a full table scan.
      candidate_overlaps AS (
        -- Early prune: a candidate climb's Jaccard with the target can't
        -- exceed (shared / target_size). So any candidate sharing fewer
        -- than ceil(targetSize * threshold) holds with the target is
        -- guaranteed below threshold no matter how many holds it has. We
        -- can drop it here, before candidate_sizes runs, and skip the
        -- size-counting work on roughly an order of magnitude of
        -- unrelated climbs at scale (100k+ Kilter climbs).
        SELECT h.climb_uuid AS uuid, COUNT(DISTINCT h.hold_id) AS shared
        FROM ${dbSchema.boardClimbHolds} h
        INNER JOIN target_holds t ON t.hold_id = h.hold_id
        INNER JOIN ${dbSchema.boardClimbs} c
          ON c.uuid = h.climb_uuid
         AND c.board_type = h.board_type
        WHERE h.board_type = ${boardType}
          AND h.hold_state IN ${KNOWN_HOLD_STATES_SQL}
          AND c.layout_id = ${layoutId}
          AND c.is_draft = FALSE
          -- IS NOT FALSE rather than = true so we include rows where Aurora
          -- left is_listed NULL (most kilter/tension Aurora-synced climbs).
          AND c.is_listed IS NOT FALSE
          AND c.frames_count = 1
          -- Aurora-convention "No match" placeholder climbs are not real
          -- routes; exclude them from both the gate and the similarity list.
          AND LOWER(COALESCE(c.description, '')) NOT LIKE 'no match%'
          ${excludeUuid ? sql`AND h.climb_uuid <> ${excludeUuid}` : sql``}
        GROUP BY h.climb_uuid
        HAVING COUNT(DISTINCT h.hold_id) >= CEIL(${targetSize}::float * ${safeThreshold})::int
      ),
      candidate_sizes AS (
        -- Count distinct hold positions on each candidate (state irrelevant).
        -- Restricted to the canonical hold-state set so unknown-state rows
        -- from a future Aurora schema don't depress Jaccard.
        SELECT climb_uuid AS uuid, COUNT(DISTINCT hold_id) AS n
        FROM ${dbSchema.boardClimbHolds}
        WHERE board_type = ${boardType}
          AND hold_state IN ${KNOWN_HOLD_STATES_SQL}
          AND climb_uuid IN (SELECT uuid FROM candidate_overlaps)
        GROUP BY climb_uuid
      )
      SELECT
        c.uuid AS uuid,
        c.name AS name,
        c.setter_username AS setter_username,
        c.angle AS angle,
        c.layout_id AS layout_id,
        c.frames AS frames,
        c.compatible_size_ids AS compatible_size_ids,
        bdg.boulder_name AS difficulty_name,
        ${dbSchema.boardClimbStats.qualityAverage} AS quality_average,
        ${dbSchema.boardClimbStats.ascensionistCount} AS ascensionist_count,
        o.shared::int AS shared,
        cs.n::int AS candidate_hold_count,
        (o.shared::float / (${targetSize} + cs.n - o.shared)) AS jaccard
      FROM candidate_overlaps o
      INNER JOIN candidate_sizes cs ON cs.uuid = o.uuid
      INNER JOIN ${dbSchema.boardClimbs} c
        ON c.uuid = o.uuid
       AND c.board_type = ${boardType}
      LEFT JOIN ${dbSchema.boardClimbStats}
        ON ${dbSchema.boardClimbStats.boardType} = c.board_type
       AND ${dbSchema.boardClimbStats.climbUuid} = c.uuid
       AND ${dbSchema.boardClimbStats.angle} = ${statsAngle != null ? sql`${statsAngle}` : sql`c.angle`}
      LEFT JOIN ${dbSchema.boardDifficultyGrades} bdg
        ON bdg.board_type = c.board_type
       AND bdg.difficulty = ROUND(${dbSchema.boardClimbStats.displayDifficulty})
      WHERE (o.shared::float / (${targetSize} + cs.n - o.shared)) >= ${safeThreshold}
      ORDER BY jaccard DESC, COALESCE(${dbSchema.boardClimbStats.ascensionistCount}, 0) DESC, c.uuid ASC
      LIMIT ${safeLimit}
    `,
  );

  return rows.map((row) => ({
    uuid: row.uuid,
    name: row.name,
    setterUsername: row.setter_username,
    angle: row.angle,
    layoutId: row.layout_id,
    frames: row.frames,
    difficultyName: row.difficulty_name ?? null,
    qualityAverage: row.quality_average == null ? null : Number(row.quality_average),
    ascensionistCount: row.ascensionist_count == null ? null : Number(row.ascensionist_count),
    compatibleSizeIds: row.compatible_size_ids ?? [],
    similarity: Number(row.jaccard),
    sharedHoldCount: Number(row.shared),
    candidateHoldCount: Number(row.candidate_hold_count),
    targetHoldCount: targetSize,
  }));
}

export const CLIMB_DUPLICATE_ERROR_CODE = 'CLIMB_IS_DUPLICATE';

export function buildDuplicateClimbErrorMessage(existingName?: string | null): string {
  const trimmed = existingName?.trim();
  if (trimmed) {
    return `A climb with the same holds already exists: "${trimmed}"`;
  }
  return 'A climb with the same holds already exists';
}
