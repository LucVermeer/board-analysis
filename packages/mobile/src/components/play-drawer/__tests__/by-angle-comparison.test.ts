import { describe, it, expect } from 'vitest';
import type { BoardseshGradeAtAngle } from '@boardsesh/graphql/operations';
import type { AngleGradeBar } from '../community-utils';
import {
  buildDumbbellByAngleModel,
  buildDumbbellAxis,
  sizeBinForSends,
  hasAnyBoardseshDiamond,
} from '../by-angle-comparison';
import { MAX_DIFFICULTY_ID } from '../../../lib/boardsesh-grade-display';

// 20 = 6c/V5, 22 = 7a/V6 on the shared difficulty scale.
function bsRow(overrides: Partial<BoardseshGradeAtAngle> = {}): BoardseshGradeAtAngle {
  return {
    angle: 40,
    localGrade: 20,
    universalGrade: 20,
    gradeLow: 20,
    gradeHigh: 20,
    confidence: 'confirmed',
    ascensionistCount: 30,
    modelVersion: 'v1',
    computedAt: '2026-01-01',
    ...overrides,
  };
}

function crowdBar(overrides: Partial<AngleGradeBar> = {}): AngleGradeBar {
  return { angle: 40, difficulty: 20, gradeName: 'V5', sends: 30, ...overrides };
}

describe('sizeBinForSends', () => {
  it('bins by ascent count: <5 small, 5–20 medium, >20 large', () => {
    expect(sizeBinForSends(0)).toBe('small');
    expect(sizeBinForSends(4)).toBe('small');
    expect(sizeBinForSends(5)).toBe('medium');
    expect(sizeBinForSends(20)).toBe('medium');
    expect(sizeBinForSends(21)).toBe('large');
    expect(sizeBinForSends(2000)).toBe('large');
  });
});

describe('buildDumbbellByAngleModel', () => {
  it('returns an empty model for no data', () => {
    expect(buildDumbbellByAngleModel([], [], 'v-grade')).toEqual([]);
  });

  it('joins crowd and Boardsesh at the same angle and sorts by angle', () => {
    const rows = buildDumbbellByAngleModel(
      [bsRow({ angle: 45, universalGrade: 22 }), bsRow({ angle: 20, universalGrade: 20 })],
      [crowdBar({ angle: 45, difficulty: 22, gradeName: 'V6' }), crowdBar({ angle: 20, difficulty: 20 })],
      'v-grade',
    );
    expect(rows.map((row) => row.angle)).toEqual([20, 45]);
    expect(rows[0]).toMatchObject({
      angle: 20,
      crowdLabel: 'V5',
      boardseshLabel: 'V5',
      hasCrowd: true,
      hasBoardsesh: true,
    });
    expect(rows[1]).toMatchObject({ angle: 45, crowdLabel: 'V6', boardseshLabel: 'V6' });
  });

  it('detects agreement when crowd and Boardsesh round to the same grade', () => {
    const [row] = buildDumbbellByAngleModel(
      [bsRow({ universalGrade: 20.3 })],
      [crowdBar({ difficulty: 19.8 })],
      'v-grade',
    );
    // Both round to V5.
    expect(row.agree).toBe(true);
  });

  it('does not mark agreement when the grades round apart', () => {
    const [row] = buildDumbbellByAngleModel(
      [bsRow({ universalGrade: 20 })],
      [crowdBar({ difficulty: 22, gradeName: 'V6' })],
      'v-grade',
    );
    expect(row.agree).toBe(false);
    expect(row.crowdLabel).toBe('V6');
    expect(row.boardseshLabel).toBe('V5');
  });

  it('prefers the universal grade over the local grade for the diamond', () => {
    const [row] = buildDumbbellByAngleModel([bsRow({ universalGrade: 22, localGrade: 20 })], [], 'v-grade');
    expect(row.boardseshGrade).toBe(22);
    expect(row.boardseshLabel).toBe('V6');
  });

  it('falls back to the local grade when there is no universal grade', () => {
    const [row] = buildDumbbellByAngleModel([bsRow({ universalGrade: null, localGrade: 20 })], [], 'v-grade');
    expect(row.boardseshGrade).toBe(20);
    expect(row.boardseshLabel).toBe('V5');
  });

  it('draws no diamond for a setter_only Boardsesh row but keeps the crowd ring', () => {
    const [row] = buildDumbbellByAngleModel(
      [bsRow({ confidence: 'setter_only' })],
      [crowdBar({ difficulty: 20 })],
      'v-grade',
    );
    expect(row).toMatchObject({ hasCrowd: true, hasBoardsesh: false, tier: 'setter_only' });
    expect(row.boardseshGrade).toBeNull();
    expect(row.crowdLabel).toBe('V5');
  });

  it('drops an angle that has neither a crowd grade nor a Boardsesh diamond', () => {
    const rows = buildDumbbellByAngleModel([bsRow({ angle: 40, confidence: 'setter_only' })], [], 'v-grade');
    expect(rows).toEqual([]);
  });

  it('keeps a lone crowd ring when Boardsesh has no row at that angle', () => {
    const [row] = buildDumbbellByAngleModel([], [crowdBar({ angle: 30, difficulty: 20, sends: 12 })], 'v-grade');
    expect(row).toMatchObject({ angle: 30, hasCrowd: true, hasBoardsesh: false, tier: null, agree: false });
    expect(row.sizeBin).toBe('medium');
  });

  it('keeps a lone Boardsesh diamond when the crowd has no bar at that angle', () => {
    const [row] = buildDumbbellByAngleModel([bsRow({ angle: 35, universalGrade: 22 })], [], 'v-grade');
    expect(row).toMatchObject({ angle: 35, hasCrowd: false, hasBoardsesh: true, crowdGrade: null });
  });

  it('sizes a joined angle by the larger of crowd and Boardsesh counts', () => {
    const [row] = buildDumbbellByAngleModel([bsRow({ ascensionistCount: 40 })], [crowdBar({ sends: 3 })], 'v-grade');
    expect(row.sends).toBe(40);
    expect(row.sizeBin).toBe('large');
  });

  it('carries the provisional whisker bounds only when a diamond is drawn', () => {
    const [withDiamond] = buildDumbbellByAngleModel(
      [bsRow({ confidence: 'provisional', universalGrade: 20, gradeLow: 18, gradeHigh: 22 })],
      [],
      'v-grade',
    );
    expect(withDiamond).toMatchObject({ tier: 'provisional', gradeLow: 18, gradeHigh: 22 });

    const [setterOnly] = buildDumbbellByAngleModel(
      [bsRow({ confidence: 'setter_only', gradeLow: 18, gradeHigh: 22 })],
      [crowdBar()],
      'v-grade',
    );
    expect(setterOnly.gradeLow).toBeNull();
    expect(setterOnly.gradeHigh).toBeNull();
  });

  it('tints the diamond by its own grade colour', () => {
    const [row] = buildDumbbellByAngleModel([bsRow({ universalGrade: 20 })], [], 'v-grade');
    expect(row.boardseshColor).toMatch(/^#/);
  });
});

describe('hasAnyBoardseshDiamond', () => {
  it('is false when every row is crowd-only', () => {
    const rows = buildDumbbellByAngleModel([], [crowdBar({ angle: 30 }), crowdBar({ angle: 40 })], 'v-grade');
    expect(hasAnyBoardseshDiamond(rows)).toBe(false);
  });

  it('is true when any row carries a diamond', () => {
    const rows = buildDumbbellByAngleModel([bsRow({ angle: 40 })], [crowdBar({ angle: 30 })], 'v-grade');
    expect(hasAnyBoardseshDiamond(rows)).toBe(true);
  });
});

describe('buildDumbbellAxis', () => {
  it('spans the plotted values with grade headroom on each side', () => {
    const rows = buildDumbbellByAngleModel(
      [bsRow({ angle: 40, universalGrade: 22 })],
      [crowdBar({ angle: 40, difficulty: 20 })],
      'v-grade',
    );
    const axis = buildDumbbellAxis(rows, 'v-grade');
    // Values 20 and 22, padded by two ids each side → window contains 18..24.
    expect(axis.minId).toBeLessThanOrEqual(18);
    expect(axis.maxId).toBeGreaterThanOrEqual(24);
    expect(axis.yAxisLabelTexts).toHaveLength(axis.noOfSections + 1);
    expect(axis.yAxisLabelTexts.every((label) => label.length > 0)).toBe(true);
    expect(axis.maxValue).toBe(axis.maxId - axis.minId);
  });

  it('includes the whisker bounds in the span', () => {
    const rows = buildDumbbellByAngleModel(
      [bsRow({ angle: 40, confidence: 'provisional', universalGrade: 20, gradeLow: 16, gradeHigh: 24 })],
      [],
      'v-grade',
    );
    const axis = buildDumbbellAxis(rows, 'v-grade');
    // gradeLow 16 and gradeHigh 24 both fall inside the padded window.
    expect(axis.minId).toBeLessThanOrEqual(16);
    expect(axis.maxId).toBeGreaterThanOrEqual(24);
  });

  it('steps by two ids and labels fewer gridlines on a wide span', () => {
    const rows = buildDumbbellByAngleModel(
      [bsRow({ angle: 20, universalGrade: 12 }), bsRow({ angle: 45, universalGrade: 26 })],
      [],
      'v-grade',
    );
    const axis = buildDumbbellAxis(rows, 'v-grade');
    expect(axis.step).toBe(2);
    expect(axis.maxValue).toBe(axis.step * axis.noOfSections);
    expect(axis.maxId).toBe(axis.minId + axis.maxValue);
  });

  it('returns a safe default window for an empty model', () => {
    const axis = buildDumbbellAxis([], 'v-grade');
    expect(axis.noOfSections).toBeGreaterThanOrEqual(1);
    expect(axis.yAxisLabelTexts).toHaveLength(axis.noOfSections + 1);
  });

  it('keeps the top tick truthful when the step extension would overflow the scale', () => {
    // Boardsesh grades V6 (id 22) and V16 (id 33, the top of the scale). Padding
    // gives the window [20, 33], span 13 → step 2, ceil(13/2)=7 sections,
    // maxValue 14. Growing the top upward would land on id 34, whose label clamps
    // to a false "V16"; instead the window grows downward so the top tick is a
    // real V16 and the marker-geometry invariant (maxId − minId === maxValue) holds.
    const rows = buildDumbbellByAngleModel(
      [
        bsRow({ angle: 20, universalGrade: 22, gradeLow: 22, gradeHigh: 22 }),
        bsRow({ angle: 45, universalGrade: 33, gradeLow: 33, gradeHigh: 33 }),
      ],
      [],
      'v-grade',
    );
    const axis = buildDumbbellAxis(rows, 'v-grade');
    expect(axis.maxId).toBeLessThanOrEqual(MAX_DIFFICULTY_ID); // never past the hardest real grade
    expect(axis.maxId).toBe(axis.minId + axis.maxValue); // marker geometry stays consistent
    expect(axis.yAxisLabelTexts[axis.yAxisLabelTexts.length - 1]).toBe('V16'); // truthful top tick
  });
});
