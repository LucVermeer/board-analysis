// Pure join builder for the "crowd vs Boardsesh grade by angle" dumbbell chart.
//
// Fuses two per-angle series into ONE comparison model:
//  - the CROWD series (community displayDifficulty per angle, from
//    `buildAngleGradeBars`) — "what this board's crowd calls it".
//  - the BOARDSESH series (the nightly cross-board grade per angle, from
//    `useBoardseshGradesForAngles`) — "what it climbs everywhere".
//
// The gap between the two markers at an angle IS the correction. Kept free of
// React so the join + axis math unit-test without a renderer.
import type { GradeDisplayFormat } from '@boardsesh/play-view';
import type { BoardseshGradeAtAngle } from '@boardsesh/graphql/operations';
import {
  renderDifficulty,
  clampDifficultyId,
  MIN_DIFFICULTY_ID,
  MAX_DIFFICULTY_ID,
} from '../../lib/boardsesh-grade-display';
import type { AngleGradeBar } from './community-utils';

/** Boardsesh confidence at an angle. Mirrors the grade resolver's tiers. */
export type DumbbellTier = 'confirmed' | 'provisional' | 'setter_only';

/** Ascent-count bin → marker size. `<5` small · `5–20` medium · `>20` large. */
export type DumbbellSizeBin = 'small' | 'medium' | 'large';

/**
 * One angle of the dumbbell chart. `crowd*` fields describe the community ring;
 * `boardsesh*` fields describe the Boardsesh diamond. Either side may be null
 * (an angle present in only one source draws a lone marker). A diamond is only
 * drawn when `hasBoardsesh` is true — a `setter_only` (or grade-less) Boardsesh
 * row keeps its crowd ring but carries no diamond.
 */
export type DumbbellAngleRow = {
  angle: number;
  /** Community display difficulty (float on the shared scale), or null. */
  crowdGrade: number | null;
  /** Formatted community grade label (e.g. "V5"), or null. */
  crowdLabel: string | null;
  /** Boardsesh grade (float), or null when no diamond is drawn at this angle. */
  boardseshGrade: number | null;
  /** Formatted Boardsesh grade label, or null. */
  boardseshLabel: string | null;
  /** Grade colour for the diamond (tinted by ITS grade), or null. */
  boardseshColor: string | null;
  /** Ascent count driving the marker size at this angle. */
  sends: number;
  /** Size bin derived from `sends`. */
  sizeBin: DumbbellSizeBin;
  /** Boardsesh confidence at this angle, or null when there's no Boardsesh row. */
  tier: DumbbellTier | null;
  /** Provisional whisker bounds (float), or null. */
  gradeLow: number | null;
  gradeHigh: number | null;
  /** True when crowd + Boardsesh round to the same grade (draw a nested glyph, no stem). */
  agree: boolean;
  /** True when the crowd has a grade at this angle (draw a ring). */
  hasCrowd: boolean;
  /** True when a Boardsesh diamond is drawn at this angle. */
  hasBoardsesh: boolean;
};

const KNOWN_TIERS: ReadonlySet<string> = new Set<DumbbellTier>(['confirmed', 'provisional', 'setter_only']);

/** Normalise a confidence string to a known tier, defaulting unknowns to provisional. */
function toTier(confidence: string | undefined): DumbbellTier | null {
  if (confidence == null) return null;
  if (KNOWN_TIERS.has(confidence)) return confidence as DumbbellTier;
  // An unexpected confidence value reads as still-settling, matching the
  // singular grade view's "everything else is provisional" rule.
  return 'provisional';
}

/** `<5` small · `5–20` medium · `>20` large. */
export function sizeBinForSends(sends: number): DumbbellSizeBin {
  if (sends < 5) return 'small';
  if (sends <= 20) return 'medium';
  return 'large';
}

/**
 * Join the Boardsesh per-angle rows with the community per-angle bars into one
 * dumbbell model, sorted ascending by angle.
 *
 * Rules:
 *  - Boardsesh series prefers each row's `universalGrade`, falling back to
 *    `localGrade` (small boards that never earn a universal number).
 *  - A `setter_only` Boardsesh row (or one with no usable grade) draws NO
 *    diamond, but its crowd ring is still kept when the crowd has that angle.
 *  - An angle present in only one source yields a lone marker (no stem).
 *  - An angle with neither a crowd grade nor a Boardsesh diamond is dropped.
 *  - `sends` (marker size) uses the larger of the community count and the
 *    Boardsesh ascensionist count at that angle, so a lone marker still sizes.
 */
export function buildDumbbellByAngleModel(
  boardseshRows: BoardseshGradeAtAngle[],
  crowdBars: AngleGradeBar[],
  gradeFormat: GradeDisplayFormat,
): DumbbellAngleRow[] {
  const crowdByAngle = new Map<number, AngleGradeBar>();
  for (const bar of crowdBars) crowdByAngle.set(bar.angle, bar);

  const boardseshByAngle = new Map<number, BoardseshGradeAtAngle>();
  for (const row of boardseshRows) boardseshByAngle.set(row.angle, row);

  const angles = Array.from(new Set([...crowdByAngle.keys(), ...boardseshByAngle.keys()])).sort((a, b) => a - b);

  const rows: DumbbellAngleRow[] = [];
  for (const angle of angles) {
    const crowd = crowdByAngle.get(angle);
    const boardsesh = boardseshByAngle.get(angle);

    const crowdGrade = crowd?.difficulty ?? null;
    const crowdLabel = crowd?.gradeName ?? null;
    const crowdSends = crowd?.sends ?? 0;

    const tier = toTier(boardsesh?.confidence);
    // No Boardsesh-branded number for setter-only rows — they carry no diamond.
    const boardseshRaw =
      boardsesh && tier !== 'setter_only' ? (boardsesh.universalGrade ?? boardsesh.localGrade) : null;
    const rendered = boardseshRaw != null ? renderDifficulty(boardseshRaw, gradeFormat) : null;
    const boardseshGrade = rendered ? boardseshRaw : null;
    const boardseshLabel = rendered?.label ?? null;
    const boardseshColor = rendered?.color ?? null;

    const hasCrowd = crowdGrade != null;
    const hasBoardsesh = boardseshGrade != null && boardseshLabel != null;
    if (!hasCrowd && !hasBoardsesh) continue;

    const sends = Math.max(crowdSends, boardsesh?.ascensionistCount ?? 0);
    const agree = hasCrowd && hasBoardsesh && clampDifficultyId(crowdGrade) === clampDifficultyId(boardseshGrade);

    rows.push({
      angle,
      crowdGrade,
      crowdLabel,
      boardseshGrade,
      boardseshLabel,
      boardseshColor,
      sends,
      sizeBin: sizeBinForSends(sends),
      tier,
      gradeLow: hasBoardsesh ? (boardsesh?.gradeLow ?? null) : null,
      gradeHigh: hasBoardsesh ? (boardsesh?.gradeHigh ?? null) : null,
      agree,
      hasCrowd,
      hasBoardsesh,
    });
  }

  return rows;
}

/** True when at least one row carries a Boardsesh diamond. */
export function hasAnyBoardseshDiamond(rows: DumbbellAngleRow[]): boolean {
  return rows.some((row) => row.hasBoardsesh);
}

/**
 * The standardized-grade Y axis for the dumbbell: an integer grade window that
 * covers every plotted value (both markers + whisker bounds) with ~1 grade of
 * padding on each side, plus the V-grade tick labels. Values are plotted after
 * shifting by `minId` (so the axis can start above V0 instead of wasting the
 * lower half of the plot).
 */
export type DumbbellAxis = {
  /** Integer grade id at the axis bottom. */
  minId: number;
  /** Integer grade id at the axis top. */
  maxId: number;
  /** Grade ids per gridline section (1, or 2 for a wide span). */
  step: number;
  /** Number of gridline sections. */
  noOfSections: number;
  /** Plotted-unit span (a grade float shifted by `minId` never exceeds this). */
  maxValue: number;
  /** Tick labels bottom→top, one per section boundary (`noOfSections + 1`). */
  yAxisLabelTexts: string[];
};

// Above this many grades of span, one gridline per grade crowds the axis, so
// we label every other grade instead.
const DENSE_SPAN_THRESHOLD = 8;

/**
 * Build the shared Y axis from the dumbbell rows. Falls back to a small window
 * around V0 when there are no plottable values (an empty/degenerate model).
 */
export function buildDumbbellAxis(rows: DumbbellAngleRow[], gradeFormat: GradeDisplayFormat): DumbbellAxis {
  const values: number[] = [];
  for (const row of rows) {
    if (row.crowdGrade != null) values.push(row.crowdGrade);
    if (row.boardseshGrade != null) values.push(row.boardseshGrade);
    if (row.gradeLow != null) values.push(row.gradeLow);
    if (row.gradeHigh != null) values.push(row.gradeHigh);
  }

  const lowValue = values.length ? Math.min(...values) : MIN_DIFFICULTY_ID;
  const highValue = values.length ? Math.max(...values) : MIN_DIFFICULTY_ID + 2;

  // ~One grade of headroom on each side (two Font steps on the id scale),
  // clamped to the scale, so markers + whiskers never sit on the axis edge.
  let minId = Math.max(MIN_DIFFICULTY_ID, clampDifficultyId(lowValue) - 2);
  let maxId = Math.min(MAX_DIFFICULTY_ID, clampDifficultyId(highValue) + 2);
  // Guarantee at least a two-grade window so markers never sit on the edge.
  if (maxId - minId < 2) {
    maxId = Math.min(MAX_DIFFICULTY_ID, minId + 2);
    minId = Math.max(MIN_DIFFICULTY_ID, maxId - 2);
  }

  const step = maxId - minId > DENSE_SPAN_THRESHOLD ? 2 : 1;
  const noOfSections = Math.ceil((maxId - minId) / step);
  const maxValue = step * noOfSections;
  // Extend the top so the window is an exact multiple of the step (keeps the top
  // tick label truthful and the marker for the hardest grade inside the plot).
  maxId = minId + maxValue;

  const yAxisLabelTexts = Array.from(
    { length: noOfSections + 1 },
    (_, index) => renderDifficulty(minId + index * step, gradeFormat)?.label ?? '',
  );

  return { minId, maxId, step, noOfSections, maxValue, yAxisLabelTexts };
}
