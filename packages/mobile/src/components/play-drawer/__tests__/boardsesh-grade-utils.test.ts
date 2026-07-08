import { describe, it, expect } from 'vitest';
import type { BoardseshGrade } from '@boardsesh/graphql/operations';
import {
  buildBoardseshGradeView,
  buildBoardseshGradeSummary,
  buildCorrection,
  formatHalfGrades,
  renderDifficulty,
  isMoonBoard,
} from '../boardsesh-grade-utils';

function makeGrade(overrides: Partial<BoardseshGrade> = {}): BoardseshGrade {
  return {
    localGrade: 20,
    universalGrade: 20,
    gradeLow: 20,
    gradeHigh: 20,
    confidence: 'confirmed',
    ascensionistCount: 42,
    modelVersion: 'v1',
    computedAt: '2026-01-01',
    ...overrides,
  };
}

describe('renderDifficulty', () => {
  it('rounds a float to the nearest grade and colours it', () => {
    // 20 = 6c/V5 on the shared scale.
    const rendered = renderDifficulty(20.3, 'v-grade');
    expect(rendered?.label).toBe('V5');
    expect(rendered?.color).toMatch(/^#/);
  });

  it('formats to Font when the preference asks for it', () => {
    expect(renderDifficulty(20, 'font')?.label).toBe('6C');
  });

  it('clamps below and above the scale bounds', () => {
    expect(renderDifficulty(-100, 'v-grade')?.label).toBe('V0'); // clamps to 4a/V0
    expect(renderDifficulty(9999, 'v-grade')?.label).toBe('V16'); // clamps to 8c+/V16
  });
});

describe('isMoonBoard', () => {
  it('matches case-insensitively', () => {
    expect(isMoonBoard('moonboard')).toBe(true);
    expect(isMoonBoard('MoonBoard')).toBe(true);
    expect(isMoonBoard('kilter')).toBe(false);
  });
});

describe('buildBoardseshGradeView', () => {
  it('returns the moonboard tier without a grade', () => {
    expect(buildBoardseshGradeView('moonboard', makeGrade(), 'v-grade')).toEqual({ kind: 'moonboard' });
  });

  it('falls back to setter-only (no grade) when there is no grade row', () => {
    expect(buildBoardseshGradeView('kilter', null, 'v-grade')).toEqual({ kind: 'setterOnly', grade: null, count: 0 });
  });

  it('carries the setter grade + count for setter_only confidence', () => {
    const view = buildBoardseshGradeView(
      'kilter',
      makeGrade({ confidence: 'setter_only', ascensionistCount: 2 }),
      'v-grade',
    );
    expect(view.kind).toBe('setterOnly');
    if (view.kind === 'setterOnly') {
      expect(view.grade?.label).toBe('V5');
      expect(view.count).toBe(2);
    }
  });

  it('returns setter-only with a null grade when both grade values are null', () => {
    const view = buildBoardseshGradeView(
      'kilter',
      makeGrade({ confidence: 'confirmed', universalGrade: null, localGrade: null }),
      'v-grade',
    );
    expect(view).toMatchObject({ kind: 'setterOnly', grade: null });
  });

  it('shows a confirmed cross-board grade with the send count and raw value', () => {
    const view = buildBoardseshGradeView('kilter', makeGrade({ universalGrade: 22, ascensionistCount: 7 }), 'v-grade');
    expect(view).toMatchObject({ kind: 'confirmed', universal: true, count: 7, gradeValue: 22 });
    if (view.kind === 'confirmed') expect(view.grade.label).toBe('V6'); // 22 = 7a/V6
  });

  it('marks the grade local-only when there is no universal grade', () => {
    const view = buildBoardseshGradeView('kilter', makeGrade({ universalGrade: null, localGrade: 20 }), 'v-grade');
    expect(view).toMatchObject({ kind: 'confirmed', universal: false, gradeValue: 20 });
  });

  it('shows a provisional range when the bounds round to different grades', () => {
    const view = buildBoardseshGradeView(
      'kilter',
      makeGrade({ confidence: 'provisional', universalGrade: 20, gradeLow: 20, gradeHigh: 22 }),
      'v-grade',
    );
    expect(view).toMatchObject({ kind: 'provisional', universal: true, rangeLabel: 'V5–V6' });
  });

  it('shows a provisional single grade (no range) when the bounds round together', () => {
    const view = buildBoardseshGradeView(
      'kilter',
      makeGrade({ confidence: 'provisional', universalGrade: 20, gradeLow: 20, gradeHigh: 20.4 }),
      'v-grade',
    );
    expect(view).toMatchObject({ kind: 'provisional', rangeLabel: null });
    if (view.kind === 'provisional') expect(view.grade.label).toBe('V5');
  });

  it('treats an unknown confidence value as provisional', () => {
    const view = buildBoardseshGradeView(
      'kilter',
      makeGrade({ confidence: 'something-new', gradeLow: null, gradeHigh: null }),
      'v-grade',
    );
    expect(view.kind).toBe('provisional');
  });

  it('passes computedAt through unchanged for confirmed and provisional tiers', () => {
    const confirmed = buildBoardseshGradeView('kilter', makeGrade({ computedAt: '2026-03-15T00:00:00Z' }), 'v-grade');
    expect(confirmed).toMatchObject({ kind: 'confirmed', computedAt: '2026-03-15T00:00:00Z' });

    const provisional = buildBoardseshGradeView(
      'kilter',
      makeGrade({ confidence: 'provisional', computedAt: '2026-03-16T00:00:00Z' }),
      'v-grade',
    );
    expect(provisional).toMatchObject({ kind: 'provisional', computedAt: '2026-03-16T00:00:00Z' });
  });
});

describe('formatHalfGrades', () => {
  it('renders ½-step magnitudes compactly', () => {
    expect(formatHalfGrades(0)).toBeNull();
    expect(formatHalfGrades(0.5)).toBe('½');
    expect(formatHalfGrades(1)).toBe('1');
    expect(formatHalfGrades(1.5)).toBe('1½');
    expect(formatHalfGrades(2)).toBe('2');
  });
});

describe('buildCorrection', () => {
  it('returns null when there is no crowd grade at this angle', () => {
    expect(buildCorrection(null, 20, 'v-grade')).toBeNull();
  });

  it('reads a stiffer crowd as "everywhere is easier"', () => {
    // Crowd 22 (V6) vs cross-board 20 (V5): the crowd over-grades by one V-grade
    // (two id steps), so everywhere it climbs a full grade easier.
    const correction = buildCorrection(22, 20, 'v-grade');
    expect(correction).toMatchObject({ direction: 'easier', steps: 1, label: '1' });
    expect(correction?.crowd.label).toBe('V6');
  });

  it('reads a softer crowd as "everywhere is stiffer"', () => {
    const correction = buildCorrection(20, 22, 'v-grade');
    expect(correction).toMatchObject({ direction: 'stiffer', steps: 1, label: '1' });
  });

  it('rounds a one-id gap to half a grade', () => {
    const correction = buildCorrection(21, 20, 'v-grade');
    expect(correction).toMatchObject({ direction: 'easier', steps: 0.5, label: '½' });
  });

  it('reports equal when both round to the same grade bucket', () => {
    const correction = buildCorrection(20.3, 20, 'v-grade');
    expect(correction).toMatchObject({ direction: 'equal', steps: 0, label: null });
  });
});

describe('buildBoardseshGradeSummary', () => {
  it('leads with the correction when a differing crowd label is supplied', () => {
    const view = buildBoardseshGradeView('kilter', makeGrade({ universalGrade: 20 }), 'v-grade');
    expect(buildBoardseshGradeSummary(view, { crowdLabel: 'V6' })).toBe('V6 ▸ V5 ✓');
  });

  it('shows just the confirmed grade with a check when there is no crowd label', () => {
    const view = buildBoardseshGradeView('kilter', makeGrade({ universalGrade: 20 }), 'v-grade');
    expect(buildBoardseshGradeSummary(view)).toBe('V5 ✓');
  });

  it('drops the arrow when the crowd label matches the cross-board grade', () => {
    const view = buildBoardseshGradeView('kilter', makeGrade({ universalGrade: 20 }), 'v-grade');
    expect(buildBoardseshGradeSummary(view, { crowdLabel: 'V5' })).toBe('V5 ✓');
  });

  it('marks a local-only grade with the local word', () => {
    const view = buildBoardseshGradeView('kilter', makeGrade({ universalGrade: null, localGrade: 20 }), 'v-grade');
    expect(buildBoardseshGradeSummary(view, { localWord: 'local' })).toBe('V5 · local');
  });

  it('shows the bare local grade when no local word is supplied', () => {
    const view = buildBoardseshGradeView('kilter', makeGrade({ universalGrade: null, localGrade: 20 }), 'v-grade');
    expect(buildBoardseshGradeSummary(view)).toBe('V5');
  });

  it('marks a provisional grade with a tilde', () => {
    const view = buildBoardseshGradeView(
      'kilter',
      makeGrade({ confidence: 'provisional', universalGrade: 20, gradeLow: 20, gradeHigh: 20.4 }),
      'v-grade',
    );
    expect(buildBoardseshGradeSummary(view)).toBe('V5 ~');
  });

  it('uses the range for a provisional grade spanning two grades', () => {
    const view = buildBoardseshGradeView(
      'kilter',
      makeGrade({ confidence: 'provisional', universalGrade: 20, gradeLow: 20, gradeHigh: 22 }),
      'v-grade',
    );
    expect(buildBoardseshGradeSummary(view)).toBe('V5–V6 ~');
  });

  it('returns null for moonboard and setter-only tiers', () => {
    expect(buildBoardseshGradeSummary({ kind: 'moonboard' })).toBeNull();
    expect(buildBoardseshGradeSummary({ kind: 'setterOnly', grade: null, count: 0 })).toBeNull();
  });
});
