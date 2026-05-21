import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { tFromCatalog } from '@/app/__test-helpers__/i18n-mock';
import { getGradesForBoard } from '@/app/lib/board-data';
import { GradeRangePicker } from '../grade-range-picker';

vi.mock('react-i18next', () => ({
  useTranslation: (ns?: string) => ({
    t: (key: string, options?: Record<string, unknown>) => tFromCatalog(ns, key, options),
    i18n: { language: 'en-US' },
  }),
  Trans: ({ children }: { children?: React.ReactNode }) => children ?? null,
}));

vi.mock('@/app/lib/user-preferences-db', () => ({
  getGradeDisplayFormat: () => Promise.resolve('v-grade'),
  setGradeDisplayFormat: () => Promise.resolve(undefined),
  getPreference: () => Promise.resolve(null),
  setPreference: () => Promise.resolve(undefined),
  removePreference: () => Promise.resolve(undefined),
}));

vi.mock('@/app/hooks/use-color-mode', () => ({
  useColorMode: () => ({ mode: 'light' }),
}));

const kilterGrades = getGradesForBoard('kilter');
const moonGrades = getGradesForBoard('moonboard');

// V6 = 7a = difficulty_id 22, V8 = 7b = 24, V11 = 8a = 28.
const V6 = 22;
const V8 = 24;
const V11 = 28;

function getChip(label: string) {
  return screen.getByRole('option', { name: label });
}

describe('<GradeRangePicker />', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows "Any" in the summary when both bounds are unset', () => {
    render(
      <GradeRangePicker
        grades={kilterGrades}
        minGradeId={undefined}
        maxGradeId={undefined}
        onChange={() => undefined}
      />,
    );
    expect(screen.getByText('Any')).toBeDefined();
  });

  it('renders one chip per grade plus the leading "Any" clear chip', () => {
    render(
      <GradeRangePicker
        grades={kilterGrades}
        minGradeId={undefined}
        maxGradeId={undefined}
        onChange={() => undefined}
      />,
    );
    // The "Any" chip is the role=option labelled "Any" (the search summary
    // also uses the string "Any" but the chip is a button).
    const options = screen.getAllByRole('option');
    // Grades + 1 clear chip.
    expect(options.length).toBe(kilterGrades.length + 1);
  });

  it('tapping a grade chip collapses to that single grade', () => {
    const onChange = vi.fn();
    render(
      <GradeRangePicker grades={kilterGrades} minGradeId={undefined} maxGradeId={undefined} onChange={onChange} />,
    );
    fireEvent.click(getChip('V6'));
    expect(onChange.mock.calls.at(-1)?.[0]).toEqual({ minGradeId: V6, maxGradeId: V6 });
  });

  it('tapping the currently-selected single-grade chip clears the filter', () => {
    const onChange = vi.fn();
    render(<GradeRangePicker grades={kilterGrades} minGradeId={V6} maxGradeId={V6} onChange={onChange} />);
    fireEvent.click(getChip('V6'));
    expect(onChange.mock.calls.at(-1)?.[0]).toEqual({ minGradeId: undefined, maxGradeId: undefined });
  });

  it('tapping the "Any" chip clears the filter', () => {
    const onChange = vi.fn();
    render(<GradeRangePicker grades={kilterGrades} minGradeId={V6} maxGradeId={V6} onChange={onChange} />);
    fireEvent.click(getChip('Any'));
    expect(onChange.mock.calls.at(-1)?.[0]).toEqual({ minGradeId: undefined, maxGradeId: undefined });
  });

  it('tapping a different grade chip while a range is set collapses to that single grade', () => {
    const onChange = vi.fn();
    render(<GradeRangePicker grades={kilterGrades} minGradeId={V6} maxGradeId={V11} onChange={onChange} />);
    fireEvent.click(getChip('V8'));
    expect(onChange.mock.calls.at(-1)?.[0]).toEqual({ minGradeId: V8, maxGradeId: V8 });
  });

  it('long-press + tap of a second chip emits a range', () => {
    const onChange = vi.fn();
    render(
      <GradeRangePicker grades={kilterGrades} minGradeId={undefined} maxGradeId={undefined} onChange={onChange} />,
    );

    // Pointer down on V6, advance past the long-press threshold → enters
    // anchor mode silently (no filter change yet).
    fireEvent.pointerDown(getChip('V6'));
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(onChange).not.toHaveBeenCalled();

    // Tap V11 → range set as [V6, V11] in one shot.
    fireEvent.click(getChip('V11'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls.at(-1)?.[0]).toEqual({ minGradeId: V6, maxGradeId: V11 });
  });

  it('long-press + tap of an earlier chip sorts the bounds', () => {
    const onChange = vi.fn();
    render(
      <GradeRangePicker grades={kilterGrades} minGradeId={undefined} maxGradeId={undefined} onChange={onChange} />,
    );
    fireEvent.pointerDown(getChip('V11'));
    act(() => {
      vi.advanceTimersByTime(400);
    });
    fireEvent.click(getChip('V6'));
    expect(onChange.mock.calls.at(-1)?.[0]).toEqual({ minGradeId: V6, maxGradeId: V11 });
  });

  it('short tap (no long-press) just collapses to that grade', () => {
    const onChange = vi.fn();
    render(
      <GradeRangePicker grades={kilterGrades} minGradeId={undefined} maxGradeId={undefined} onChange={onChange} />,
    );
    const chipV6 = getChip('V6');
    fireEvent.pointerDown(chipV6);
    fireEvent.pointerUp(chipV6);
    fireEvent.click(chipV6);
    expect(onChange.mock.calls.at(-1)?.[0]).toEqual({ minGradeId: V6, maxGradeId: V6 });
  });

  it('MoonBoard board — V0 grades (kilter-only) are not rendered', () => {
    render(
      <GradeRangePicker grades={moonGrades} minGradeId={undefined} maxGradeId={undefined} onChange={() => undefined} />,
    );
    // MoonBoard starts at V1; V0 chips shouldn't exist. (V1 appears multiple
    // times because both 5a/V1 and 5b/V1 format to "V1" — that's expected
    // and matches the inline grade picker's behaviour.)
    expect(screen.queryAllByRole('option', { name: 'V0' }).length).toBe(0);
    expect(screen.queryAllByRole('option', { name: 'V1' }).length).toBeGreaterThan(0);
  });

  it('shows "V6 to V11" summary when a range is set', () => {
    render(<GradeRangePicker grades={kilterGrades} minGradeId={V6} maxGradeId={V11} onChange={() => undefined} />);
    expect(screen.getByText('V6 to V11')).toBeDefined();
  });

  it('shows "V6 only" summary when both bounds collapse to the same grade', () => {
    render(<GradeRangePicker grades={kilterGrades} minGradeId={V6} maxGradeId={V6} onChange={() => undefined} />);
    expect(screen.getByText('V6 only')).toBeDefined();
  });
});
