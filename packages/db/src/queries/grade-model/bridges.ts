import { sql, type SQL } from 'drizzle-orm';
import { MOON_BRIDGE_MAX_LOO_DELTA, MOON_BRIDGE_MIN_SENDS_PER_BOARD, MOON_BRIDGE_MIN_USERS } from './constants';
import type { GateResult, MoonBridgeReadiness } from './types';

export interface MoonBridgeSampleRow {
  user_id: string;
  moon_median: number;
  anchor_median: number;
  moon_graded: number;
  anchor_graded: number;
}

export function buildMoonBridgeSampleSql(): SQL {
  return sql`
    WITH per_board AS (
      SELECT user_id,
             board_type,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY difficulty) AS median_grade,
             COUNT(*)::int AS graded_sends
      FROM boardsesh_ticks
      WHERE difficulty IS NOT NULL
        AND status IN ('flash', 'send')
        AND board_type IN ('moonboard', 'kilter', 'tension')
      GROUP BY user_id, board_type
    ),
    anchor AS (
      SELECT user_id,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY median_grade) AS anchor_median,
             MAX(graded_sends)::int AS anchor_graded
      FROM per_board
      WHERE board_type IN ('kilter', 'tension')
      GROUP BY user_id
    )
    SELECT moon.user_id,
           moon.median_grade AS moon_median,
           anchor.anchor_median,
           moon.graded_sends AS moon_graded,
           anchor.anchor_graded
    FROM per_board moon
    JOIN anchor ON anchor.user_id = moon.user_id
    WHERE moon.board_type = 'moonboard'
      AND moon.graded_sends >= ${MOON_BRIDGE_MIN_SENDS_PER_BOARD}
      AND anchor.anchor_graded >= ${MOON_BRIDGE_MIN_SENDS_PER_BOARD}
  `;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[midpoint - 1] + sorted[midpoint]) / 2 : sorted[midpoint];
}

export function evaluateMoonBridgeReadiness(samples: MoonBridgeSampleRow[]): MoonBridgeReadiness {
  const gaps = samples.map((sample) => Number(sample.anchor_median) - Number(sample.moon_median));
  const candidateOffset = median(gaps);
  let looMaxDelta: number | null = null;
  if (candidateOffset !== null && gaps.length > 1) {
    looMaxDelta = 0;
    for (let gapIndex = 0; gapIndex < gaps.length; gapIndex++) {
      const leaveOneOut = median(gaps.slice(0, gapIndex).concat(gaps.slice(gapIndex + 1)));
      if (leaveOneOut !== null) looMaxDelta = Math.max(looMaxDelta, Math.abs(leaveOneOut - candidateOffset));
    }
  }
  return {
    boardType: 'moonboard',
    bridgeUsers: samples.length,
    requiredUsers: MOON_BRIDGE_MIN_USERS,
    minSendsPerBoard: MOON_BRIDGE_MIN_SENDS_PER_BOARD,
    candidateOffset,
    looMaxDelta,
    publishable:
      samples.length >= MOON_BRIDGE_MIN_USERS &&
      candidateOffset !== null &&
      looMaxDelta !== null &&
      looMaxDelta <= MOON_BRIDGE_MAX_LOO_DELTA,
  };
}

export function moonBridgeReadinessGate(readiness: MoonBridgeReadiness): GateResult {
  const reason = readiness.publishable
    ? 'Moon bridge has enough paired users for a future publish path'
    : `Moon bridge report-only: ${readiness.bridgeUsers}/${readiness.requiredUsers} users with >=${readiness.minSendsPerBoard} graded sends per side`;
  return {
    gate: 'moon_bridge_readiness',
    passed: true,
    detail: reason,
    metrics: {
      users: readiness.bridgeUsers,
      requiredUsers: readiness.requiredUsers,
      minSendsPerBoard: readiness.minSendsPerBoard,
      candidateOffset: readiness.candidateOffset ?? 0,
      looMaxDelta: readiness.looMaxDelta ?? 0,
      publishable: readiness.publishable ? 1 : 0,
      maxLooDelta: MOON_BRIDGE_MAX_LOO_DELTA,
    },
  };
}

export interface BoardBridgeSample {
  userId: string;
  boardType: string;
  grade: number;
}

export interface PairwiseBridgeEdge {
  fromBoard: string;
  toBoard: string;
  offset: number;
  sharedUsers: number;
  looMaxDelta: number;
}

export interface AnchorBridgeOffsets {
  offsets: Record<string, { offset: number; users: number; looMaxDelta: number }>;
  withheldBoards: string[];
}

export interface PairwiseBridgeOptions {
  minSharedUsers: number;
  maxLooDelta: number;
}

const DEFAULT_PAIRWISE_BRIDGE_OPTIONS: PairwiseBridgeOptions = {
  minSharedUsers: MOON_BRIDGE_MIN_USERS,
  maxLooDelta: MOON_BRIDGE_MAX_LOO_DELTA,
};

function resolvePairwiseBridgeOptions(options: Partial<PairwiseBridgeOptions> | undefined): PairwiseBridgeOptions {
  return { ...DEFAULT_PAIRWISE_BRIDGE_OPTIONS, ...options };
}

function looMaxDelta(values: number[], estimate: number): number {
  if (values.length <= 1) return 0;
  let maxDelta = 0;
  for (let valueIndex = 0; valueIndex < values.length; valueIndex++) {
    const leaveOneOut = median(values.slice(0, valueIndex).concat(values.slice(valueIndex + 1)));
    if (leaveOneOut !== null) maxDelta = Math.max(maxDelta, Math.abs(leaveOneOut - estimate));
  }
  return maxDelta;
}

export function estimatePairwiseBridgeEdges(
  samples: readonly BoardBridgeSample[],
  options?: Partial<PairwiseBridgeOptions>,
): PairwiseBridgeEdge[] {
  const resolvedOptions = resolvePairwiseBridgeOptions(options);
  const perUserBoardGrades = new Map<string, Map<string, number[]>>();
  for (const sample of samples) {
    const userGrades = perUserBoardGrades.get(sample.userId) ?? new Map<string, number[]>();
    const boardGrades = userGrades.get(sample.boardType) ?? [];
    boardGrades.push(sample.grade);
    userGrades.set(sample.boardType, boardGrades);
    perUserBoardGrades.set(sample.userId, userGrades);
  }

  const perUserBoardMedian = new Map<string, Map<string, number>>();
  const boards = new Set<string>();
  for (const [userId, userGrades] of perUserBoardGrades) {
    const userMedians = new Map<string, number>();
    for (const [boardType, grades] of userGrades) {
      const boardMedian = median(grades);
      if (boardMedian === null) continue;
      userMedians.set(boardType, boardMedian);
      boards.add(boardType);
    }
    perUserBoardMedian.set(userId, userMedians);
  }

  const sortedBoards = [...boards].sort();
  const edges: PairwiseBridgeEdge[] = [];
  for (let fromIndex = 0; fromIndex < sortedBoards.length; fromIndex++) {
    for (let toIndex = fromIndex + 1; toIndex < sortedBoards.length; toIndex++) {
      const fromBoard = sortedBoards[fromIndex];
      const toBoard = sortedBoards[toIndex];
      const gaps: number[] = [];
      for (const userMedians of perUserBoardMedian.values()) {
        const fromGrade = userMedians.get(fromBoard);
        const toGrade = userMedians.get(toBoard);
        if (fromGrade === undefined || toGrade === undefined) continue;
        gaps.push(toGrade - fromGrade);
      }
      const offset = median(gaps);
      if (offset === null || gaps.length < resolvedOptions.minSharedUsers) continue;
      edges.push({
        fromBoard,
        toBoard,
        offset,
        sharedUsers: gaps.length,
        looMaxDelta: looMaxDelta(gaps, offset),
      });
    }
  }
  return edges;
}

export function estimateAnchorBridgeOffsets(
  samples: readonly BoardBridgeSample[],
  anchorBoard: string,
  options?: Partial<PairwiseBridgeOptions>,
): AnchorBridgeOffsets {
  const resolvedOptions = resolvePairwiseBridgeOptions(options);
  const edges = estimatePairwiseBridgeEdges(samples, resolvedOptions);
  const offsets: AnchorBridgeOffsets['offsets'] = {};
  const withheldBoards: string[] = [];
  for (const edge of edges) {
    let boardType: string | null = null;
    let offset: number | null = null;
    if (edge.toBoard === anchorBoard) {
      boardType = edge.fromBoard;
      offset = edge.offset;
    } else if (edge.fromBoard === anchorBoard) {
      boardType = edge.toBoard;
      offset = -edge.offset;
    }
    if (boardType === null || offset === null) continue;
    if (edge.looMaxDelta > resolvedOptions.maxLooDelta) {
      withheldBoards.push(boardType);
      continue;
    }
    offsets[boardType] = { offset, users: edge.sharedUsers, looMaxDelta: edge.looMaxDelta };
  }
  return { offsets, withheldBoards };
}
