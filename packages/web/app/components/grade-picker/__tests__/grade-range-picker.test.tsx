import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
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

  // Rule 3a: from single grade, tap a higher chip within the 3s window
  // extends to range.
  it('from "V6 only" within the 3s window — tap V11 extends to "V6 to V11"', () => {
    const onChange = vi.fn();
    render(<GradeRangePicker grades={kilterGrades} minGradeId={V6} maxGradeId={V6} onChange={onChange} />);
    fireEvent.click(getChip('V11'));
    expect(onChange.mock.calls.at(-1)?.[0]).toEqual({ minGradeId: V6, maxGradeId: V11 });
    // Meta tells the call site this WAS a range extension (vs. a single
    // switch via the window expiring).
    expect(onChange.mock.calls.at(-1)?.[1]).toEqual({ extendedRangeWithinWindow: true });
  });

  // Rule 3b: from single grade, tap a lower chip sorts the range correctly.
  it('from "V11 only" within the window — tap V6 extends to "V6 to V11" (sorted)', () => {
    const onChange = vi.fn();
    render(<GradeRangePicker grades={kilterGrades} minGradeId={V11} maxGradeId={V11} onChange={onChange} />);
    fireEvent.click(getChip('V6'));
    expect(onChange.mock.calls.at(-1)?.[0]).toEqual({ minGradeId: V6, maxGradeId: V11 });
  });

  // The 3-second window: rapid taps build a range, slow taps switch single
  // grade. Wrapped in its own describe so fake timers don't leak.
  describe('Rule 3 — 3-second window for range extension', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('inside the window: tap V8 extends "V6 only" to "V6 to V8" with meta extendedRangeWithinWindow=true', () => {
      const onChange = vi.fn();
      render(<GradeRangePicker grades={kilterGrades} minGradeId={V6} maxGradeId={V6} onChange={onChange} />);
      // Advance ~2s — still inside the 3s window.
      vi.advanceTimersByTime(2000);
      fireEvent.click(getChip('V8'));
      expect(onChange.mock.calls.at(-1)?.[0]).toEqual({ minGradeId: V6, maxGradeId: V8 });
      expect(onChange.mock.calls.at(-1)?.[1]).toEqual({ extendedRangeWithinWindow: true });
    });

    it('outside the window: tap V8 switches "V6 only" → "V8 only" with meta extendedRangeWithinWindow=false', () => {
      const onChange = vi.fn();
      render(<GradeRangePicker grades={kilterGrades} minGradeId={V6} maxGradeId={V6} onChange={onChange} />);
      // Advance past the 3s window.
      vi.advanceTimersByTime(4000);
      fireEvent.click(getChip('V8'));
      // Switched to V8 only, NOT a V6-V8 range.
      expect(onChange.mock.calls.at(-1)?.[0]).toEqual({ minGradeId: V8, maxGradeId: V8 });
      expect(onChange.mock.calls.at(-1)?.[1]).toEqual({ extendedRangeWithinWindow: false });
    });

    it('Rule 2 (tap selected to clear) is not gated by the window — works after expiry', () => {
      const onChange = vi.fn();
      render(<GradeRangePicker grades={kilterGrades} minGradeId={V6} maxGradeId={V6} onChange={onChange} />);
      vi.advanceTimersByTime(10000);
      fireEvent.click(getChip('V6'));
      expect(onChange.mock.calls.at(-1)?.[0]).toEqual({ minGradeId: undefined, maxGradeId: undefined });
    });
  });

  // Rule 4: from a range, any chip tap collapses to that single grade.
  it('from "V6 to V11" range — tap V8 collapses to "V8 only"', () => {
    const onChange = vi.fn();
    render(<GradeRangePicker grades={kilterGrades} minGradeId={V6} maxGradeId={V11} onChange={onChange} />);
    fireEvent.click(getChip('V8'));
    expect(onChange.mock.calls.at(-1)?.[0]).toEqual({ minGradeId: V8, maxGradeId: V8 });
  });

  // Rule 4: tapping an endpoint trims the range (drops that endpoint and
  // shrinks toward the other). Replaces an earlier draft where endpoint-tap
  // collapsed destructively; that was flagged in UX review as a foot-gun.
  it('from "V6 to V11" range — tap V6 (the lower endpoint) trims to "V7 to V11"', () => {
    const onChange = vi.fn();
    render(<GradeRangePicker grades={kilterGrades} minGradeId={V6} maxGradeId={V11} onChange={onChange} />);
    fireEvent.click(getChip('V6'));
    // V6 = idx 12 → next idx 13 = V7 = id 23.
    expect(onChange.mock.calls.at(-1)?.[0]).toEqual({ minGradeId: 23, maxGradeId: V11 });
  });

  it('from "V6 to V11" range — tap V11 (the upper endpoint) trims to "V6 to V10"', () => {
    const onChange = vi.fn();
    render(<GradeRangePicker grades={kilterGrades} minGradeId={V6} maxGradeId={V11} onChange={onChange} />);
    fireEvent.click(getChip('V11'));
    // V11 = idx 18 → prev idx 17 = V10 = id 27.
    expect(onChange.mock.calls.at(-1)?.[0]).toEqual({ minGradeId: V6, maxGradeId: 27 });
  });

  it('from a two-grade range — tapping the upper endpoint collapses to the lower as a single grade', () => {
    const onChange = vi.fn();
    // V6 (id 22) → V7 (id 23) is a two-grade range. Tapping V7 trims but the
    // trim would invert (next-max = V6 = current min), so it collapses to
    // "V6 only".
    render(<GradeRangePicker grades={kilterGrades} minGradeId={V6} maxGradeId={23} onChange={onChange} />);
    fireEvent.click(getChip('V7'));
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
