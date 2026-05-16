import { sql } from 'drizzle-orm';
import * as dbSchema from '@boardsesh/db/schema';
import { convertLitUpHoldsStringToMap } from '@boardsesh/board-constants/hold-states';
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
// a real duplicate through. Inlined as a SQL literal because the set is a
// static invariant of the hold-state model; keep in sync with
// `STATE_TO_PRIMARY_CODE` in `@boardsesh/board-constants/hold-states`.
const KNOWN_HOLD_STATES_SQL = sql`('STARTING', 'HAND', 'FINISH', 'FOOT')`;

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
  const dedupedByHoldId = new Map<number, string>();
  for (const { holdId, holdState } of entries) {
    dedupedByHoldId.set(holdId, holdState);
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
        ${dbSchema.boardClimbs.angle},
        ${dbSchema.boardClimbStats.ascensionistCount}
      HAVING string_agg(
        ${dbSchema.boardClimbHolds.holdId}::text || ':' || ${dbSchema.boardClimbHolds.holdState},
        ',' ORDER BY ${dbSchema.boardClimbHolds.holdId}
      ) = ${signature}
      ORDER BY COALESCE(${dbSchema.boardClimbStats.ascensionistCount}, 0) DESC, ${dbSchema.boardClimbs.uuid} ASC
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
};

/**
 * Find published climbs on the same board+layout that share at least
 * `threshold` Jaccard similarity over (hold_id, hold_state) tuples.
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
}: FindSimilarClimbsArgs): Promise<SimilarClimbResult[]> {
  const dedupedByHoldId = new Map<number, string>();
  for (const { holdId, holdState } of holds) {
    dedupedByHoldId.set(holdId, holdState);
  }
  const targetEntries = Array.from(dedupedByHoldId.entries()).map(([holdId, holdState]) => ({ holdId, holdState }));
  if (targetEntries.length === 0) return [];

  const targetSize = targetEntries.length;
  const safeThreshold = Math.max(0, Math.min(1, threshold));
  const safeLimit = Math.max(1, Math.min(200, limit));
  const targetHoldsJson = JSON.stringify(targetEntries);

  const rows = await executeRows<{
    uuid: string;
    name: string | null;
    setter_username: string | null;
    angle: number | null;
    layout_id: number;
    frames: string | null;
    shared: number;
    candidate_hold_count: number;
    jaccard: number;
  }>(
    db,
    sql`
      WITH target_holds AS (
        SELECT
          (entry->>'holdId')::int AS hold_id,
          entry->>'holdState' AS hold_state
        FROM jsonb_array_elements(${targetHoldsJson}::jsonb) AS entry
      ),
      candidate_overlaps AS (
        SELECT h.climb_uuid AS uuid, COUNT(*) AS shared
        FROM ${dbSchema.boardClimbHolds} h
        INNER JOIN target_holds t
          ON t.hold_id = h.hold_id
         AND t.hold_state = h.hold_state
        INNER JOIN ${dbSchema.boardClimbs} c
          ON c.uuid = h.climb_uuid
         AND c.board_type = h.board_type
        WHERE h.board_type = ${boardType}
          AND h.hold_state IN ${KNOWN_HOLD_STATES_SQL}
          AND c.layout_id = ${layoutId}
          AND c.is_draft = FALSE
          AND c.is_listed IS NOT FALSE
          AND c.frames_count = 1
          ${excludeUuid ? sql`AND h.climb_uuid <> ${excludeUuid}` : sql``}
        GROUP BY h.climb_uuid
      ),
      candidate_sizes AS (
        -- Restrict to the same canonical set as the target so an existing climb
        -- with rows in unknown states doesn't inflate its size and depress Jaccard.
        SELECT climb_uuid AS uuid, COUNT(*) AS n
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
       AND ${dbSchema.boardClimbStats.angle} = c.angle
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
