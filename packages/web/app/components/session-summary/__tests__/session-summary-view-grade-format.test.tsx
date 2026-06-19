import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';
import { render, screen } from '@testing-library/react';
import React from 'react';
import type { SessionSummary } from '@boardsesh/shared-schema';
import SessionSummaryView from '../session-summary-view';

// --- Mocks ---

type GradeFormatMock = {
  gradeFormat: 'v-grade' | 'font';
  formatGrade: (d: string | null | undefined) => string | null;
  getGradeColor: (d?: string | null, dk?: boolean) => string | undefined;
  loaded: boolean;
  setGradeFormat: ReturnType<typeof vi.fn>;
};
const defaultGradeFormat: GradeFormatMock = {
  gradeFormat: 'v-grade',
  formatGrade: (d: string | null | undefined) => {
    if (!d) return null;
    const match = d.match(/V\d+\+?/i);
    return match ? match[0].toUpperCase() : null;
  },
  getGradeColor: () => '#888',
  loaded: true,
  setGradeFormat: vi.fn(),
};
const mockUseGradeFormat = vi.fn<() => GradeFormatMock>(() => defaultGradeFormat);
vi.mock('@/app/hooks/use-grade-format', () => ({
  useGradeFormat: () => mockUseGradeFormat(),
}));

vi.mock('@/app/lib/grade-colors', () => ({
  getGradeColor: (d: string | null | undefined) => (d ? '#vivid' : undefined),
}));

// --- Helpers ---

const makeSummary = (overrides: Partial<SessionSummary> = {}): SessionSummary =>
  ({
    totalSends: 5,
    totalAttempts: 3,
    totalFlashes: 2,
    durationMinutes: 60,
    goal: null,
    hardestClimb: { climbName: 'Hard One', grade: '7a/V6' },
    gradeDistribution: [
      { grade: '6a/V3', count: 3 },
      { grade: '7a/V6', count: 1 },
    ],
    participants: [],
    ...overrides,
  }) as unknown as SessionSummary;

describe('SessionSummaryView grade format integration', () => {
  beforeEach(() => {
    mockUseGradeFormat.mockReturnValue({ ...defaultGradeFormat });
  });

  it('renders V-grade in hardest climb chip when loaded', () => {
    const { container } = render(<SessionSummaryView summary={makeSummary()} />);
    // The Chip label is rendered inside a span with MuiChip-label class
    const chipLabel = container.querySelector('.MuiChip-label');
    expect(chipLabel).toBeTruthy();
    expect(chipLabel!.textContent).toBe('V6');
  });

  it('renders Font grade in hardest climb chip', () => {
    mockUseGradeFormat.mockReturnValue({
      ...defaultGradeFormat,
      gradeFormat: 'font',
      formatGrade: (d: string | null | undefined) => {
        if (!d) return null;
        const slashIndex = d.indexOf('/');
        if (slashIndex > 0) return d.substring(0, slashIndex).toUpperCase();
        const match = d.match(/\d[abc]\+?/i);
        return match ? match[0].toUpperCase() : null;
      },
    });
    const { container } = render(<SessionSummaryView summary={makeSummary()} />);
    const chipLabel = container.querySelector('.MuiChip-label');
    expect(chipLabel).toBeTruthy();
    expect(chipLabel!.textContent).toBe('7A');
  });

  it('renders grade distribution labels with format', () => {
    render(<SessionSummaryView summary={makeSummary()} />);
    expect(screen.getByText('V3')).toBeTruthy();
    // V6 appears in both chip and distribution; verify at least 2 occurrences
    expect(screen.getAllByText('V6').length).toBeGreaterThanOrEqual(2);
  });

  it('shows Skeleton for hardest climb chip when loading', () => {
    mockUseGradeFormat.mockReturnValue({
      ...defaultGradeFormat,
      loaded: false,
    });
    const { container } = render(<SessionSummaryView summary={makeSummary()} />);
    const skeletons = container.querySelectorAll('.MuiSkeleton-root');
    expect(skeletons.length).toBeGreaterThanOrEqual(1);
  });

  it('shows Skeleton for distribution labels when loading', () => {
    mockUseGradeFormat.mockReturnValue({
      ...defaultGradeFormat,
      loaded: false,
    });
    const { container } = render(<SessionSummaryView summary={makeSummary()} />);
    // One skeleton for the hardest climb chip + one per grade distribution entry (2)
    const skeletons = container.querySelectorAll('.MuiSkeleton-root');
    expect(skeletons.length).toBeGreaterThanOrEqual(3);
  });
});
