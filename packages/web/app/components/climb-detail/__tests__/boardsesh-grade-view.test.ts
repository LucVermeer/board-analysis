import { describe, it, expect } from 'vite-plus/test';
import type { BoardseshGrade } from '@boardsesh/graphql/operations/boardsesh-grade';
import { deriveBoardseshGradeView, isMoonBoard } from '../boardsesh-grade-view';

function grade(overrides: Partial<BoardseshGrade>): BoardseshGrade {
  return {
    localGrade: 20,
    universalGrade: 20,
    gradeLow: null,
    gradeHigh: null,
    confidence: 'confirmed',
    ascensionistCount: 42,
    modelVersion: 'v1',
    computedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('isMoonBoard', () => {
  it('matches moonboard case-insensitively', () => {
    expect(isMoonBoard('moonboard')).toBe(true);
    expect(isMoonBoard('MoonBoard')).toBe(true);
    expect(isMoonBoard('kilter')).toBe(false);
    expect(isMoonBoard(null)).toBe(false);
    expect(isMoonBoard(undefined)).toBe(false);
  });
});

describe('deriveBoardseshGradeView', () => {
  it('returns the moonboard tier without a grade fetch', () => {
    expect(deriveBoardseshGradeView({ boardName: 'moonboard', grade: null })).toEqual({ kind: 'moonboard' });
    // MoonBoard wins even if a grade row somehow exists.
    expect(deriveBoardseshGradeView({ boardName: 'moonboard', grade: grade({}) })).toEqual({ kind: 'moonboard' });
  });

  it('returns setterOnly when the grade is null', () => {
    expect(deriveBoardseshGradeView({ boardName: 'kilter', grade: null })).toEqual({ kind: 'setterOnly' });
  });

  it('returns setterOnly for setter_only confidence', () => {
    expect(deriveBoardseshGradeView({ boardName: 'kilter', grade: grade({ confidence: 'setter_only' }) })).toEqual({
      kind: 'setterOnly',
    });
  });

  it('rounds the universal grade for a confirmed tier', () => {
    const view = deriveBoardseshGradeView({
      boardName: 'kilter',
      grade: grade({ universalGrade: 20.4, localGrade: 19, confidence: 'confirmed', ascensionistCount: 88 }),
    });
    expect(view).toEqual({ kind: 'confirmed', scope: 'universal', difficultyId: 20, ascensionistCount: 88 });
  });

  it('falls back to the local grade when universal is null (local scope)', () => {
    const view = deriveBoardseshGradeView({
      boardName: 'grasshopper',
      grade: grade({ universalGrade: null, localGrade: 17.6, confidence: 'confirmed' }),
    });
    expect(view).toEqual({ kind: 'confirmed', scope: 'local', difficultyId: 18, ascensionistCount: 42 });
  });

  it('flags a provisional range when the rounded bounds differ', () => {
    const view = deriveBoardseshGradeView({
      boardName: 'tension',
      grade: grade({
        universalGrade: 20.5,
        gradeLow: 20,
        gradeHigh: 22,
        confidence: 'provisional',
        ascensionistCount: 6,
      }),
    });
    expect(view).toEqual({
      kind: 'provisional',
      scope: 'universal',
      difficultyId: 21,
      lowDifficultyId: 20,
      highDifficultyId: 22,
      isRange: true,
      ascensionistCount: 6,
    });
  });

  it('collapses a provisional range when the bounds round to the same grade', () => {
    const view = deriveBoardseshGradeView({
      boardName: 'tension',
      grade: grade({
        universalGrade: 20,
        gradeLow: 19.8,
        gradeHigh: 20.2,
        confidence: 'provisional',
        ascensionistCount: 3,
      }),
    });
    expect(view).toMatchObject({ kind: 'provisional', isRange: false, lowDifficultyId: 20, highDifficultyId: 20 });
  });

  it('treats a missing primary grade as setterOnly', () => {
    expect(
      deriveBoardseshGradeView({
        boardName: 'kilter',
        grade: grade({ universalGrade: null, localGrade: null, confidence: 'confirmed' }),
      }),
    ).toEqual({ kind: 'setterOnly' });
  });
});
