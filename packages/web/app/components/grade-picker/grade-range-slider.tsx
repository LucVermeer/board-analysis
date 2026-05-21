'use client';

import React, { useMemo } from 'react';
import MuiSlider from '@mui/material/Slider';
import { useTranslation } from 'react-i18next';
import { useGradeFormat } from '@/app/hooks/use-grade-format';
import { useIsDarkMode } from '@/app/hooks/use-is-dark-mode';
import type { BoulderGrade } from '@/app/lib/board-data';
import styles from './grade-range-slider.module.css';

export type GradeRangeSliderProps = {
  grades: readonly BoulderGrade[];
  /** undefined = "no lower bound"; the slider sits at the lowest grade. */
  minGradeId: number | undefined;
  /** undefined = "no upper bound"; the slider sits at the highest grade. */
  maxGradeId: number | undefined;
  /**
   * Emits the new bounds. Each side returns `undefined` when the user drags
   * back to the extreme, so the caller can clear the URL param (the call
   * site coerces `undefined` to its `0` sentinel before sending to
   * `updateFilters`, matching the inline picker's clear behavior).
   */
  onChange: (next: { minGradeId: number | undefined; maxGradeId: number | undefined }) => void;
  ariaLabel?: string;
};

/**
 * Maps a `[lowIdx, highIdx]` slider tuple back into bounded
 * `difficulty_id`s. Each endpoint at its extreme means "unbounded" so the
 * filter clears to the URL's `0` sentinel.
 */
export function sliderValueToGradeIds(
  value: readonly [number, number],
  grades: readonly BoulderGrade[],
): { minGradeId: number | undefined; maxGradeId: number | undefined } {
  if (grades.length === 0) {
    return { minGradeId: undefined, maxGradeId: undefined };
  }
  const lastIdx = grades.length - 1;
  const [low, high] = value;
  return {
    minGradeId: low <= 0 ? undefined : grades[low].difficulty_id,
    maxGradeId: high >= lastIdx ? undefined : grades[high].difficulty_id,
  };
}

/**
 * Maps current min/max `difficulty_id`s into the slider's index tuple.
 * Unbounded sides anchor to the extremes so the slider visually fills the
 * track when no filter is active.
 */
export function gradeIdsToSliderValue(
  minGradeId: number | undefined,
  maxGradeId: number | undefined,
  grades: readonly BoulderGrade[],
): [number, number] {
  if (grades.length === 0) return [0, 0];
  const lastIdx = grades.length - 1;
  const minIdx = minGradeId === undefined ? 0 : grades.findIndex((g) => g.difficulty_id === minGradeId);
  const maxIdx = maxGradeId === undefined ? lastIdx : grades.findIndex((g) => g.difficulty_id === maxGradeId);
  return [minIdx < 0 ? 0 : minIdx, maxIdx < 0 ? lastIdx : maxIdx];
}

/**
 * `useGradeFormat`'s dark-mode color is tuned for TEXT readability
 * (`hsl(h, 80%, 77%)`), which reads as washed-out when painted as a fill on
 * the dark slider rail. This helper keeps the light-mode color as-is and,
 * in dark mode, extracts the hue from the HSL string and re-renders it at
 * a punchier saturation/lightness suitable for a filled shape.
 */
function saturateFill(color: string | undefined, isDark: boolean): string | undefined {
  if (!color || !isDark) return color;
  const match = color.match(/hsl\(\s*(-?\d+(?:\.\d+)?)/);
  if (!match) return color;
  const hue = Math.round(Number.parseFloat(match[1]));
  return `hsl(${hue}, 85%, 62%)`;
}

export const GradeRangeSlider: React.FC<GradeRangeSliderProps> = ({
  grades,
  minGradeId,
  maxGradeId,
  onChange,
  ariaLabel,
}) => {
  const { t } = useTranslation('climbs');
  const { formatGrade, getGradeColor } = useGradeFormat();
  const isDark = useIsDarkMode();

  const value = useMemo(() => gradeIdsToSliderValue(minGradeId, maxGradeId, grades), [minGradeId, maxGradeId, grades]);
  const lastIdx = grades.length - 1;

  const lowGrade = grades[value[0]];
  const highGrade = grades[value[1]];
  const lowLabel = lowGrade ? (formatGrade(lowGrade.difficulty_name) ?? lowGrade.v_grade) : '';
  const highLabel = highGrade ? (formatGrade(highGrade.difficulty_name) ?? highGrade.v_grade) : '';
  const lowColor = lowGrade ? getGradeColor(lowGrade.difficulty_name, isDark) : undefined;
  const highColor = highGrade ? getGradeColor(highGrade.difficulty_name, isDark) : undefined;
  // `getGradeColor` returns a text-readable variant — in dark mode that's
  // hsl(h, 80%, 77%), which is intentionally pale so it reads against a dark
  // background as TYPE. For a filled track/thumb on the same dark surface,
  // that's too washed out. Pull the hue and re-render at lower lightness so
  // the gradient and thumbs actually pop.
  const lowFill = saturateFill(lowColor, isDark);
  const highFill = saturateFill(highColor, isDark);
  // Paint the selected band as a sweep from the low thumb's grade color to
  // the high thumb's — so the visible range looks like the band it represents.
  const trackGradient = lowFill && highFill ? `linear-gradient(to right, ${lowFill}, ${highFill})` : undefined;
  // Brief fallback for the IDB-load window before `useGradeFormat` resolves.
  const brandFill = 'color-mix(in srgb, var(--color-primary) 95%, transparent)';
  const lowThumbFill = lowFill ?? brandFill;
  const highThumbFill = highFill ?? brandFill;

  // Dynamic summary so the row's label tells the user the *current* filter
  // state. Distinguishes "Any" from "V0 to V16" — important because the
  // slider naturally anchors its thumbs at the extremes when nothing is
  // filtered, which would otherwise read identically to "all grades selected".
  const summary = useMemo(() => {
    if (minGradeId === undefined && maxGradeId === undefined) return t('search.fields.any');
    if (minGradeId !== undefined && maxGradeId !== undefined) {
      if (minGradeId === maxGradeId) return t('search.fields.gradeRangeOnly', { grade: lowLabel });
      return t('search.fields.gradeRangeBetween', { min: lowLabel, max: highLabel });
    }
    if (minGradeId !== undefined) return t('search.fields.gradeRangeAndUp', { grade: lowLabel });
    return t('search.fields.gradeRangeUpTo', { grade: highLabel });
  }, [minGradeId, maxGradeId, lowLabel, highLabel, t]);

  const handleChange = (_: Event, next: number | number[]) => {
    const tuple = Array.isArray(next) ? (next as [number, number]) : [next, next];
    onChange(sliderValueToGradeIds([tuple[0], tuple[1]], grades));
  };

  const ariaValueText = (idx: number): string => {
    const grade = grades[idx];
    if (!grade) return '';
    return formatGrade(grade.difficulty_name) ?? grade.v_grade;
  };

  // Outer halo on the thumb in the panel's surface color so the colored
  // thumb doesn't blend into the equally-colored gradient track. Resolves
  // to a light tone on light surfaces and a dark tone on dark surfaces via
  // the theme.
  const thumbHalo = 'var(--semantic-surface, #ffffff)';

  return (
    <div className={styles.wrapper}>
      <div className={styles.labelRow}>
        <span className={styles.fieldLabel}>{t('search.fields.gradeRange')}</span>
        <span className={styles.fieldSummary}>{summary}</span>
      </div>
      <div className={styles.sliderHost}>
        <MuiSlider
          value={value}
          onChange={handleChange}
          min={0}
          max={lastIdx > 0 ? lastIdx : 1}
          step={1}
          disableSwap
          aria-label={ariaLabel ?? t('search.fields.gradeRange')}
          getAriaValueText={ariaValueText}
          sx={{
            color: 'var(--color-primary)',
            height: 6,
            padding: '14px 0',
            '& .MuiSlider-rail': {
              opacity: 1,
              // `--neutral-500` switches itself between modes via the theme,
              // so one rule covers both.
              backgroundColor: 'color-mix(in srgb, var(--neutral-500) 25%, transparent)',
            },
            '& .MuiSlider-track': {
              border: 'none',
              background: trackGradient ?? 'color-mix(in srgb, var(--color-primary) 45%, transparent)',
            },
            '& .MuiSlider-thumb': {
              width: 22,
              height: 22,
              borderRadius: '50%',
              boxShadow: `0 0 0 2px ${thumbHalo}`,
              '&:hover, &.Mui-active': {
                boxShadow: `0 0 0 2px ${thumbHalo}`,
              },
              '&.Mui-focusVisible': {
                boxShadow: `0 0 0 2px ${thumbHalo}, 0 0 0 5px color-mix(in srgb, var(--color-primary) 32%, transparent)`,
              },
              '&::before': { display: 'none' },
            },
            '& .MuiSlider-thumb[data-index="0"]': {
              backgroundColor: lowThumbFill,
            },
            '& .MuiSlider-thumb[data-index="1"]': {
              backgroundColor: highThumbFill,
            },
            // Dark mode wants a more visible focus halo on the lighter rail.
            ...(isDark && {
              '& .MuiSlider-thumb': {
                '&.Mui-focusVisible': {
                  boxShadow: `0 0 0 2px ${thumbHalo}, 0 0 0 5px color-mix(in srgb, var(--color-primary) 55%, transparent)`,
                },
              },
            }),
          }}
        />
      </div>
    </div>
  );
};
