import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vite-plus/test';
import { tFromCatalog } from '@/app/__test-helpers__/i18n-mock';
import { BOULDER_GRADES, MOONBOARD_MIN_DIFFICULTY_ID, getGradesForBoard } from '@/app/lib/board-data';
import { GradeRangeSlider, gradeIdsToSliderValue, sliderValueToGradeIds } from '../grade-range-slider';

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

describe('gradeIdsToSliderValue', () => {
  it('maps undefined min to index 0 and undefined max to the last index', () => {
    const result = gradeIdsToSliderValue(undefined, undefined, kilterGrades);
    expect(result).toEqual([0, kilterGrades.length - 1]);
  });

  it('maps a known difficulty_id back to its array index', () => {
    // V6 = 7a = difficulty_id 22 = index 12 in the full Kilter list (10..22)
    const result = gradeIdsToSliderValue(22, 28, kilterGrades);
    expect(result[0]).toBe(kilterGrades.findIndex((g) => g.difficulty_id === 22));
    expect(result[1]).toBe(kilterGrades.findIndex((g) => g.difficulty_id === 28));
  });

  it('respects MoonBoard truncation (lowest grade = 5a/V1)', () => {
    expect(moonGrades[0].difficulty_id).toBe(MOONBOARD_MIN_DIFFICULTY_ID);
    const result = gradeIdsToSliderValue(undefined, undefined, moonGrades);
    expect(result).toEqual([0, moonGrades.length - 1]);
  });
});

describe('sliderValueToGradeIds', () => {
  it('returns undefined for both ends at the extremes', () => {
    const result = sliderValueToGradeIds([0, kilterGrades.length - 1], kilterGrades);
    expect(result).toEqual({ minGradeId: undefined, maxGradeId: undefined });
  });

  it('returns a real difficulty_id once the user moves off the lower extreme', () => {
    const result = sliderValueToGradeIds([3, kilterGrades.length - 1], kilterGrades);
    expect(result.minGradeId).toBe(kilterGrades[3].difficulty_id);
    expect(result.maxGradeId).toBeUndefined();
  });

  it('returns a real difficulty_id once the user moves off the upper extreme', () => {
    const result = sliderValueToGradeIds([0, kilterGrades.length - 3], kilterGrades);
    expect(result.minGradeId).toBeUndefined();
    expect(result.maxGradeId).toBe(kilterGrades[kilterGrades.length - 3].difficulty_id);
  });

  it('handles MoonBoard grades — moving min off extreme picks the MoonBoard ID, not the BOULDER_GRADES ID', () => {
    const result = sliderValueToGradeIds([2, moonGrades.length - 1], moonGrades);
    // The 3rd MoonBoard grade is BOULDER_GRADES[2 + (MOONBOARD index offset)], which is 5c/V2 (id 15).
    expect(result.minGradeId).toBe(moonGrades[2].difficulty_id);
    expect(result.minGradeId).not.toBe(BOULDER_GRADES[2].difficulty_id); // sanity: not 12 (4c/V0)
  });
});

describe('<GradeRangeSlider />', () => {
  it('renders two slider thumbs anchored to the grade extents when bounds are unset', () => {
    render(
      <GradeRangeSlider
        grades={kilterGrades}
        minGradeId={undefined}
        maxGradeId={undefined}
        onChange={() => undefined}
      />,
    );
    const inputs = screen.getAllByRole('slider') as HTMLInputElement[];
    expect(inputs.length).toBe(2);
    expect(inputs[0].value).toBe('0');
    expect(inputs[1].value).toBe(String(kilterGrades.length - 1));
  });

  it('positions the thumbs at the matching grade indices when both bounds are set', () => {
    render(
      <GradeRangeSlider
        grades={kilterGrades}
        minGradeId={22 /* V6 */}
        maxGradeId={28 /* V11 */}
        onChange={() => undefined}
      />,
    );
    const inputs = screen.getAllByRole('slider') as HTMLInputElement[];
    expect(inputs[0].value).toBe(String(kilterGrades.findIndex((g) => g.difficulty_id === 22)));
    expect(inputs[1].value).toBe(String(kilterGrades.findIndex((g) => g.difficulty_id === 28)));
  });

  it('emits undefined for both bounds when the slider is reset to the full extent', () => {
    const onChange = vi.fn();
    // The slider is controlled — we have to drive both thumbs through state
    // or each `fireEvent.change` sees the original `value` prop. Use a tiny
    // stateful wrapper so consecutive fires accumulate.
    function Harness() {
      const [bounds, setBounds] = React.useState<{
        minGradeId: number | undefined;
        maxGradeId: number | undefined;
      }>({ minGradeId: 22, maxGradeId: 28 });
      return (
        <GradeRangeSlider
          grades={kilterGrades}
          minGradeId={bounds.minGradeId}
          maxGradeId={bounds.maxGradeId}
          onChange={(next) => {
            onChange(next);
            setBounds(next);
          }}
        />
      );
    }
    render(<Harness />);

    const inputs = screen.getAllByRole('slider') as HTMLInputElement[];
    expect(inputs.length).toBe(2);

    fireEvent.change(inputs[0], { target: { value: '0' } });
    fireEvent.change(inputs[1], { target: { value: String(kilterGrades.length - 1) } });

    const lastCall = onChange.mock.calls.at(-1)?.[0];
    expect(lastCall).toEqual({ minGradeId: undefined, maxGradeId: undefined });
  });

  it('shows "Any" in the summary when both bounds are unset', () => {
    render(
      <GradeRangeSlider
        grades={kilterGrades}
        minGradeId={undefined}
        maxGradeId={undefined}
        onChange={() => undefined}
      />,
    );
    expect(screen.getByText('Any')).toBeDefined();
  });

  it('shows "V6 to V11" when both bounds are set to distinct grades', () => {
    render(<GradeRangeSlider grades={kilterGrades} minGradeId={22} maxGradeId={28} onChange={() => undefined} />);
    expect(screen.getByText('V6 to V11')).toBeDefined();
  });

  it('shows "V6 only" when both bounds collapse to the same grade', () => {
    render(<GradeRangeSlider grades={kilterGrades} minGradeId={22} maxGradeId={22} onChange={() => undefined} />);
    expect(screen.getByText('V6 only')).toBeDefined();
  });

  it('shows "Up to V11" when only the upper bound is set', () => {
    render(
      <GradeRangeSlider grades={kilterGrades} minGradeId={undefined} maxGradeId={28} onChange={() => undefined} />,
    );
    expect(screen.getByText('Up to V11')).toBeDefined();
  });

  it('shows "V6 and up" when only the lower bound is set', () => {
    render(
      <GradeRangeSlider grades={kilterGrades} minGradeId={22} maxGradeId={undefined} onChange={() => undefined} />,
    );
    expect(screen.getByText('V6 and up')).toBeDefined();
  });

  it('emits a concrete max difficulty_id when the upper thumb leaves the extreme', () => {
    const onChange = vi.fn();
    render(
      <GradeRangeSlider grades={kilterGrades} minGradeId={undefined} maxGradeId={undefined} onChange={onChange} />,
    );

    const inputs = screen.getAllByRole('slider') as HTMLInputElement[];
    const targetIdx = kilterGrades.length - 3;
    fireEvent.change(inputs[1], { target: { value: String(targetIdx) } });

    const lastCall = onChange.mock.calls.at(-1)?.[0];
    expect(lastCall).toEqual({ minGradeId: undefined, maxGradeId: kilterGrades[targetIdx].difficulty_id });
  });
});
