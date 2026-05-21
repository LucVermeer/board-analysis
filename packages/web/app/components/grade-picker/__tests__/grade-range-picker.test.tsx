import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vite-plus/test';
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
    const options = screen.getAllByRole('option');
    expect(options.length).toBe(kilterGrades.length + 1);
  });

  // Rule 1: from "Any", tap collapses to that single grade.
  it('from "Any" — tap V6 collapses to "V6 only"', () => {
    const onChange = vi.fn();
    render(
      <GradeRangePicker grades={kilterGrades} minGradeId={undefined} maxGradeId={undefined} onChange={onChange} />,
    );
    fireEvent.click(getChip('V6'));
    expect(onChange.mock.calls.at(-1)?.[0]).toEqual({ minGradeId: V6, maxGradeId: V6 });
  });

  // Rule 2: from single grade, tap the SAME chip clears.
  it('from "V6 only" — tap V6 clears to "Any"', () => {
    const onChange = vi.fn();
    render(<GradeRangePicker grades={kilterGrades} minGradeId={V6} maxGradeId={V6} onChange={onChange} />);
    fireEvent.click(getChip('V6'));
    expect(onChange.mock.calls.at(-1)?.[0]).toEqual({ minGradeId: undefined, maxGradeId: undefined });
  });

  // Rule 3a: from single grade, tap a higher chip extends to range.
  it('from "V6 only" — tap V11 extends to "V6 to V11"', () => {
    const onChange = vi.fn();
    render(<GradeRangePicker grades={kilterGrades} minGradeId={V6} maxGradeId={V6} onChange={onChange} />);
    fireEvent.click(getChip('V11'));
    expect(onChange.mock.calls.at(-1)?.[0]).toEqual({ minGradeId: V6, maxGradeId: V11 });
  });

  // Rule 3b: from single grade, tap a lower chip sorts the range correctly.
  it('from "V11 only" — tap V6 extends to "V6 to V11" (sorted)', () => {
    const onChange = vi.fn();
    render(<GradeRangePicker grades={kilterGrades} minGradeId={V11} maxGradeId={V11} onChange={onChange} />);
    fireEvent.click(getChip('V6'));
    expect(onChange.mock.calls.at(-1)?.[0]).toEqual({ minGradeId: V6, maxGradeId: V11 });
  });

  // Rule 4: from a range, any chip tap collapses to that single grade.
  it('from "V6 to V11" range — tap V8 collapses to "V8 only"', () => {
    const onChange = vi.fn();
    render(<GradeRangePicker grades={kilterGrades} minGradeId={V6} maxGradeId={V11} onChange={onChange} />);
    fireEvent.click(getChip('V8'));
    expect(onChange.mock.calls.at(-1)?.[0]).toEqual({ minGradeId: V8, maxGradeId: V8 });
  });

  // Rule 4 also covers tapping an endpoint of the current range.
  it('from "V6 to V11" range — tap V6 (the lower endpoint) collapses to "V6 only"', () => {
    const onChange = vi.fn();
    render(<GradeRangePicker grades={kilterGrades} minGradeId={V6} maxGradeId={V11} onChange={onChange} />);
    fireEvent.click(getChip('V6'));
    expect(onChange.mock.calls.at(-1)?.[0]).toEqual({ minGradeId: V6, maxGradeId: V6 });
  });

  it('tapping the "Any" chip clears the filter', () => {
    const onChange = vi.fn();
    render(<GradeRangePicker grades={kilterGrades} minGradeId={V6} maxGradeId={V6} onChange={onChange} />);
    fireEvent.click(getChip('Any'));
    expect(onChange.mock.calls.at(-1)?.[0]).toEqual({ minGradeId: undefined, maxGradeId: undefined });
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
