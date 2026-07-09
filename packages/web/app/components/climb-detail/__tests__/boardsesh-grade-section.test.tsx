// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { BoardseshGrade } from '@boardsesh/graphql/operations/boardsesh-grade';
import BoardseshGradeSection from '../boardsesh-grade-section';

const requestMock = vi.fn();

vi.mock('@/app/lib/graphql/client', () => ({
  createGraphQLHttpClient: () => ({ request: requestMock }),
}));

vi.mock('@/app/hooks/use-is-dark-mode', () => ({
  useIsDarkMode: () => false,
}));

vi.mock('@/app/hooks/use-grade-format', () => ({
  useGradeFormat: () => ({
    loaded: true,
    formatGrade: (gradeName: string | null) => gradeName?.split('/')[1] ?? null,
    getGradeColor: () => null,
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number; grade?: string }) => {
      if (key === 'boardseshGrade.universalComparison') return `Tension scale: ${options?.grade}`;
      if (key === 'boardseshGrade.confirmedSubline') return `Confirmed by ${options?.count} sends`;
      if (key === 'boardseshGrade.provisionalSubline') return `Still settling - ${options?.count} sends in`;
      if (key === 'boardseshGrade.localLabel') return 'On this board';
      if (key === 'boardseshGrade.universalLabel') return 'Boardsesh grade';
      if (key === 'boardseshGrade.localScopeNote') return "On this board's scale";
      if (key === 'boardseshGrade.setterOnly') return "Setter's call";
      if (key === 'boardseshGrade.moonboardTitle') return 'Not standardized yet';
      if (key === 'boardseshGrade.moonboardBody') return 'No MoonBoard grades yet';
      if (key === 'boardseshGrade.loadError') return "Couldn't load the grade right now.";
      return key;
    },
  }),
}));

function grade(overrides: Partial<BoardseshGrade>): BoardseshGrade {
  return {
    localGrade: 22.03,
    universalGrade: 21.03,
    gradeLow: null,
    gradeHigh: null,
    confidence: 'confirmed',
    ascensionistCount: 127,
    modelVersion: 'v1.1',
    computedAt: '2026-07-08T00:00:00Z',
    ...overrides,
  };
}

function renderSection(boardName = 'kilter') {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <BoardseshGradeSection boardName={boardName} climbUuid="pinchwork" angle={30} />
    </QueryClientProvider>,
  );
}

describe('BoardseshGradeSection', () => {
  beforeEach(() => {
    requestMock.mockReset();
  });

  it('renders the local grade as primary and universal as secondary comparison', async () => {
    requestMock.mockResolvedValue({ boardseshGrade: grade({}) });

    renderSection();

    await waitFor(() => expect(screen.getByText('V6')).toBeTruthy());
    expect(screen.getByText('Tension scale: V5')).toBeTruthy();
    expect(screen.getByText('On this board')).toBeTruthy();
    expect(screen.getByText('Confirmed by 127 sends')).toBeTruthy();
    expect(screen.queryByText("On this board's scale")).toBeNull();
  });

  it('omits the comparison when local and universal round to the same grade', async () => {
    requestMock.mockResolvedValue({
      boardseshGrade: grade({ localGrade: 20.4, universalGrade: 20.2, ascensionistCount: 55 }),
    });

    renderSection();

    await waitFor(() => expect(screen.getByText('V5')).toBeTruthy());
    expect(screen.queryByText(/Tension scale:/)).toBeNull();
    expect(screen.queryByText("On this board's scale")).toBeNull();
  });

  it('keeps the local-only note when no universal grade exists', async () => {
    requestMock.mockResolvedValue({
      boardseshGrade: grade({ localGrade: 17.6, universalGrade: null, ascensionistCount: 42 }),
    });

    renderSection('grasshopper');

    await waitFor(() => expect(screen.getByText('V4')).toBeTruthy());
    expect(screen.getByText("On this board's scale")).toBeTruthy();
  });

  it('does not fetch grades for MoonBoard', () => {
    renderSection('moonboard');

    expect(screen.getByText('Not standardized yet')).toBeTruthy();
    expect(screen.getByText('No MoonBoard grades yet')).toBeTruthy();
    expect(requestMock).not.toHaveBeenCalled();
  });
});
