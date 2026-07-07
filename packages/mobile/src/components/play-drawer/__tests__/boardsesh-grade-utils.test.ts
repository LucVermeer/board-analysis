import { describe, it, expect } from 'vitest';
import type { BoardseshGrade } from '@boardsesh/graphql/operations';
import { buildBoardseshGradeView, renderDifficulty, isMoonBoard } from '../boardsesh-grade-utils';

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

  it('falls back to setter-only when there is no grade row', () => {
    expect(buildBoardseshGradeView('kilter', null, 'v-grade')).toEqual({ kind: 'setterOnly' });
  });

  it('returns setter-only for setter_only confidence', () => {
    const view = buildBoardseshGradeView('kilter', makeGrade({ confidence: 'setter_only' }), 'v-grade');
    expect(view.kind).toBe('setterOnly');
  });

  it('returns setter-only when both grade values are null', () => {
    const view = buildBoardseshGradeView(
      'kilter',
      makeGrade({ confidence: 'confirmed', universalGrade: null, localGrade: null }),
      'v-grade',
    );
    expect(view.kind).toBe('setterOnly');
  });

  it('shows a confirmed universal (cross-board) grade with the send count', () => {
    const view = buildBoardseshGradeView('kilter', makeGrade({ universalGrade: 22, ascensionistCount: 7 }), 'v-grade');
    expect(view).toMatchObject({ kind: 'confirmed', scope: 'universal', count: 7 });
    if (view.kind === 'confirmed') expect(view.grade.label).toBe('V6'); // 22 = 7a/V6
  });

  it('scopes to this board only when there is no universal grade', () => {
    const view = buildBoardseshGradeView('kilter', makeGrade({ universalGrade: null, localGrade: 20 }), 'v-grade');
    expect(view).toMatchObject({ kind: 'confirmed', scope: 'local' });
  });

  it('shows a provisional range when the bounds round to different grades', () => {
    const view = buildBoardseshGradeView(
      'kilter',
      makeGrade({ confidence: 'provisional', universalGrade: 20, gradeLow: 20, gradeHigh: 22 }),
      'v-grade',
    );
    expect(view).toMatchObject({ kind: 'provisional', scope: 'universal', rangeLabel: 'V5–V6' });
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
});
