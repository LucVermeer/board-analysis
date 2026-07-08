import { describe, it, expect } from 'vitest';
import type { BoardseshGrade, BoardseshGradeAtAngle } from '@boardsesh/graphql/operations';
import {
  buildBoardseshGradeView,
  buildBoardseshGradeSummary,
  buildBoardseshAngleGradeBars,
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

function makeAngleRow(overrides: Partial<BoardseshGradeAtAngle> = {}): BoardseshGradeAtAngle {
  return {
    angle: 40,
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

  describe('localSecondary', () => {
    it('shows the board-local grade when it rounds to a different label than the universal headline', () => {
      // universalGrade 22 = V6; localGrade 20 = V5 — the board scales harder/easier locally.
      const view = buildBoardseshGradeView('kilter', makeGrade({ universalGrade: 22, localGrade: 20 }), 'v-grade');
      expect(view).toMatchObject({ kind: 'confirmed', scope: 'universal' });
      if (view.kind === 'confirmed') {
        expect(view.localSecondary?.label).toBe('V5');
      }
    });

    it('omits localSecondary when the local grade rounds to the same label as the universal headline', () => {
      const view = buildBoardseshGradeView('kilter', makeGrade({ universalGrade: 20, localGrade: 20.3 }), 'v-grade');
      expect(view).toMatchObject({ kind: 'confirmed', localSecondary: null });
    });

    it('omits localSecondary when the grade is already scoped to this board', () => {
      const view = buildBoardseshGradeView('kilter', makeGrade({ universalGrade: null, localGrade: 20 }), 'v-grade');
      expect(view).toMatchObject({ kind: 'confirmed', scope: 'local', localSecondary: null });
    });

    it('omits localSecondary when there is no local grade value', () => {
      const view = buildBoardseshGradeView('kilter', makeGrade({ universalGrade: 22, localGrade: null }), 'v-grade');
      expect(view).toMatchObject({ kind: 'confirmed', localSecondary: null });
    });
  });
});

describe('buildBoardseshGradeSummary', () => {
  it('returns the grade label for a confirmed grade', () => {
    const view = buildBoardseshGradeView('kilter', makeGrade({ universalGrade: 20 }), 'v-grade');
    expect(buildBoardseshGradeSummary(view)).toBe('V5');
  });

  it('returns the range label for a provisional grade spanning two grades', () => {
    const view = buildBoardseshGradeView(
      'kilter',
      makeGrade({ confidence: 'provisional', universalGrade: 20, gradeLow: 20, gradeHigh: 22 }),
      'v-grade',
    );
    expect(buildBoardseshGradeSummary(view)).toBe('V5–V6');
  });

  it('returns the grade label with a trailing ± for a provisional single grade', () => {
    const view = buildBoardseshGradeView(
      'kilter',
      makeGrade({ confidence: 'provisional', universalGrade: 20, gradeLow: 20, gradeHigh: 20.4 }),
      'v-grade',
    );
    expect(buildBoardseshGradeSummary(view)).toBe('V5 ±');
  });

  it('returns null for moonboard and setter-only tiers', () => {
    expect(buildBoardseshGradeSummary({ kind: 'moonboard' })).toBeNull();
    expect(buildBoardseshGradeSummary({ kind: 'setterOnly' })).toBeNull();
  });
});

describe('buildBoardseshAngleGradeBars', () => {
  it('skips rows with setter_only confidence', () => {
    const bars = buildBoardseshAngleGradeBars(
      [makeAngleRow({ angle: 40, confidence: 'setter_only' }), makeAngleRow({ angle: 25, confidence: 'confirmed' })],
      'v-grade',
    );
    expect(bars).toHaveLength(1);
    expect(bars[0].angle).toBe(25);
  });

  it('skips rows with no usable grade value', () => {
    const bars = buildBoardseshAngleGradeBars(
      [makeAngleRow({ angle: 40, universalGrade: null, localGrade: null })],
      'v-grade',
    );
    expect(bars).toHaveLength(0);
  });

  it('prefers the universal grade over the local grade', () => {
    const bars = buildBoardseshAngleGradeBars(
      [makeAngleRow({ angle: 40, universalGrade: 22, localGrade: 20 })],
      'v-grade',
    );
    expect(bars[0].difficulty).toBe(22);
    expect(bars[0].gradeName).toBe('V6');
  });

  it('falls back to the local grade when there is no universal grade', () => {
    const bars = buildBoardseshAngleGradeBars(
      [makeAngleRow({ angle: 40, universalGrade: null, localGrade: 20 })],
      'v-grade',
    );
    expect(bars[0].difficulty).toBe(20);
    expect(bars[0].gradeName).toBe('V5');
  });

  it('maps ascensionistCount to sends', () => {
    const bars = buildBoardseshAngleGradeBars([makeAngleRow({ angle: 40, ascensionistCount: 17 })], 'v-grade');
    expect(bars[0].sends).toBe(17);
  });

  it('sorts bars by angle ascending', () => {
    const bars = buildBoardseshAngleGradeBars(
      [makeAngleRow({ angle: 55 }), makeAngleRow({ angle: 10 }), makeAngleRow({ angle: 40 })],
      'v-grade',
    );
    expect(bars.map((bar) => bar.angle)).toEqual([10, 40, 55]);
  });

  it('returns an empty array for no rows', () => {
    expect(buildBoardseshAngleGradeBars([], 'v-grade')).toEqual([]);
  });
});
