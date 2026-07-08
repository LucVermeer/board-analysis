// @vitest-environment jsdom
import { createElement, type ReactNode } from 'react';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BoardseshGrade, BoardseshGradeAtAngle, ClimbStatsHistoryEntry } from '@boardsesh/graphql/operations';

const hookState = vi.hoisted(() => ({
  grade: undefined as BoardseshGrade | undefined,
  angleRows: undefined as BoardseshGradeAtAngle[] | undefined,
  history: undefined as ClimbStatsHistoryEntry[] | undefined,
}));

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  PlatformColor: (name: string) => name,
  View: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
  Pressable: ({ children }: { children?: ReactNode }) => createElement('button', null, children),
  StyleSheet: { create: (styles: unknown) => styles },
}));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('expo-haptics', () => ({ selectionAsync: vi.fn() }));

vi.mock('../../Text', () => ({
  Text: ({ children }: { children?: ReactNode }) => createElement('span', null, children),
}));
vi.mock('../../Icon', () => ({
  Icon: ({ name }: { name: string }) => createElement('i', { 'data-icon': name }),
}));
vi.mock('../DumbbellByAngleChart', () => ({
  DumbbellByAngleChart: () => createElement('div', { 'data-testid': 'dumbbell' }),
}));

vi.mock('../../../providers/theme-provider', () => ({
  useTheme: () => ({ brandColors: { primary: '#6D28D9' } }),
}));
vi.mock('../../../hooks/use-grade-format', () => ({ useGradeFormat: () => ({ gradeFormat: 'v-grade' }) }));

vi.mock('../../../lib/graphql/hooks', () => ({
  useBoardseshGrade: () => ({ data: hookState.grade, isLoading: false, isError: false, refetch: vi.fn() }),
  useBoardseshGradesForAngles: () => ({ data: hookState.angleRows }),
  useClimbStatsHistory: () => ({ data: hookState.history }),
}));

import { BoardseshGradeSection } from '../BoardseshGradeSection';

function grade(overrides: Partial<BoardseshGrade> = {}): BoardseshGrade {
  return {
    localGrade: 20,
    universalGrade: 20,
    gradeLow: 19,
    gradeHigh: 21,
    confidence: 'confirmed',
    ascensionistCount: 205,
    modelVersion: 'v1',
    computedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function historyEntry(angle: number, displayDifficulty: number, sends: number): ClimbStatsHistoryEntry {
  return {
    angle,
    displayDifficulty,
    difficultyAverage: displayDifficulty,
    ascensionistCount: sends,
    qualityAverage: 3,
    createdAt: '2026-01-01T00:00:00Z',
  } as ClimbStatsHistoryEntry;
}

function angleRow(
  angle: number,
  universalGrade: number | null,
  overrides: Partial<BoardseshGradeAtAngle> = {},
): BoardseshGradeAtAngle {
  return {
    angle,
    localGrade: 20,
    universalGrade,
    gradeLow: 19,
    gradeHigh: 21,
    confidence: 'confirmed',
    ascensionistCount: 100,
    modelVersion: 'v1',
    computedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function renderSection() {
  return render(<BoardseshGradeSection climbUuid="climb-1" boardName="kilter" angle={40} />);
}

describe('BoardseshGradeSection', () => {
  beforeEach(() => {
    hookState.grade = undefined;
    hookState.angleRows = undefined;
    hookState.history = undefined;
  });

  it('leads with the correction: this-board crowd → delta pill → everywhere grade + seal + trust + chart', () => {
    // Crowd calls it V6 (22) at 40°; cross-board grade is V5 (20) — everywhere it's a grade easier.
    hookState.grade = grade({ universalGrade: 20 });
    hookState.history = [historyEntry(40, 22, 205), historyEntry(20, 21, 50)];
    hookState.angleRows = [angleRow(40, 20), angleRow(20, 19)];

    const { container } = renderSection();
    const text = container.textContent ?? '';

    expect(text).toContain('boardseshGrade.hero.thisBoard');
    expect(text).toContain('boardseshGrade.hero.everywhere');
    expect(text).toContain('boardseshGrade.hero.easier'); // delta pill
    expect(text).toContain('boardseshGrade.payoff.softer');
    expect(text).toContain('boardseshGrade.trust.confirmed');
    expect(container.querySelector('[data-icon="checkmark.seal.fill"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="dumbbell"]')).not.toBeNull();
  });

  it('renders provisional in the amber, no-seal path with the likely range', () => {
    hookState.grade = grade({ confidence: 'provisional', universalGrade: 20, gradeLow: 20, gradeHigh: 22 });
    hookState.history = [historyEntry(40, 22, 8)];
    hookState.angleRows = [angleRow(40, 20, { confidence: 'provisional' })];

    const { container } = renderSection();
    const text = container.textContent ?? '';

    expect(text).toContain('boardseshGrade.trust.provisional');
    expect(text).toContain('V5–V6'); // the two-grade range shown as the everywhere grade
    expect(container.querySelector('[data-icon="checkmark.seal.fill"]')).toBeNull();
    expect(text).not.toContain('boardseshGrade.trust.confirmed');
  });

  it('shows a muted setter call with no comparison or chart for setter_only', () => {
    hookState.grade = grade({ confidence: 'setter_only', ascensionistCount: 2 });
    hookState.history = [historyEntry(40, 22, 2)];
    hookState.angleRows = [angleRow(40, 20), angleRow(20, 19)];

    const { container } = renderSection();
    const text = container.textContent ?? '';

    expect(text).toContain('boardseshGrade.setterCall');
    expect(text).toContain('boardseshGrade.trust.setter');
    expect(text).not.toContain('boardseshGrade.hero.thisBoard');
    expect(container.querySelector('[data-testid="dumbbell"]')).toBeNull();
  });

  it('shows a single centred grade + note for a local-only (no cross-board) grade', () => {
    hookState.grade = grade({ universalGrade: null, localGrade: 20 });
    hookState.history = [historyEntry(40, 22, 205)];
    hookState.angleRows = [angleRow(40, null), angleRow(20, null)];

    const { container } = renderSection();
    const text = container.textContent ?? '';

    expect(text).toContain('boardseshGrade.hero.thisBoardOnly');
    expect(text).toContain('boardseshGrade.localOnlyNote');
    // No correction: no delta pill, no payoff sentence.
    expect(text).not.toContain('boardseshGrade.hero.easier');
    expect(text).not.toContain('boardseshGrade.payoff');
  });

  it('drops the comparison and says it matches when the crowd rounds to the same grade', () => {
    hookState.grade = grade({ universalGrade: 20 });
    hookState.history = [historyEntry(40, 20, 205)]; // crowd V5 == cross-board V5
    hookState.angleRows = [angleRow(40, 20)];

    const { container } = renderSection();
    const text = container.textContent ?? '';

    expect(text).toContain('boardseshGrade.matchesBoard');
    expect(text).toContain('boardseshGrade.payoff.same');
    expect(text).not.toContain('boardseshGrade.hero.easier');
    expect(text).not.toContain('boardseshGrade.hero.stiffer');
  });
});
