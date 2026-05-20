'use client';

import React, { useId, useMemo } from 'react';
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
 * Picks a sparse subset of grade indices to label below the track. Labelling
 * all grades crowds the rail on narrow screens; the endpoints plus every
 * Nth interior grade gives a readable reference axis.
 */
function pickMarkIndices(length: number): number[] {
  if (length <= 1) return [0];
  if (length <= 6) return Array.from({ length }, (_, i) => i);
  const stride = Math.ceil(length / 5);
  const indices = new Set<number>([0, length - 1]);
  for (let i = stride; i < length - 1; i += stride) indices.add(i);
  return [...indices].sort((a, b) => a - b);
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
  const labelId = useId();

  const value = useMemo(() => gradeIdsToSliderValue(minGradeId, maxGradeId, grades), [minGradeId, maxGradeId, grades]);
  const lastIdx = grades.length - 1;

  const marks = useMemo(() => {
    return pickMarkIndices(grades.length).map((idx) => {
      const grade = grades[idx];
      const label = formatGrade(grade.difficulty_name) ?? grade.v_grade;
      return { value: idx, label };
    });
  }, [grades, formatGrade]);

  const lowGrade = grades[value[0]];
  const highGrade = grades[value[1]];
  const lowLabel = lowGrade ? (formatGrade(lowGrade.difficulty_name) ?? lowGrade.v_grade) : '';
  const highLabel = highGrade ? (formatGrade(highGrade.difficulty_name) ?? highGrade.v_grade) : '';
  const lowColor = lowGrade ? getGradeColor(lowGrade.difficulty_name, isDark) : undefined;
  const highColor = highGrade ? getGradeColor(highGrade.difficulty_name, isDark) : undefined;

  const isUnbounded = minGradeId === undefined && maxGradeId === undefined;
  const summary = isUnbounded
    ? t('search.fields.any')
    : t('search.fields.gradeRangeSummary', { min: lowLabel, max: highLabel });

  const handleChange = (_: Event, next: number | number[]) => {
    const tuple = Array.isArray(next) ? (next as [number, number]) : [next, next];
    onChange(sliderValueToGradeIds([tuple[0], tuple[1]], grades));
  };

  const formatValueLabel = (idx: number): string => {
    const grade = grades[idx];
    if (!grade) return '';
    return formatGrade(grade.difficulty_name) ?? grade.v_grade;
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.summaryRow}>
        <span id={labelId} className={styles.summaryHint}>
          {t('search.fields.gradeRange')}
        </span>
        <span className={styles.summaryValue}>{summary}</span>
      </div>
      <div className={styles.sliderHost}>
        <MuiSlider
          value={value}
          onChange={handleChange}
          min={0}
          max={lastIdx > 0 ? lastIdx : 1}
          step={1}
          marks={marks}
          disableSwap
          valueLabelDisplay="on"
          valueLabelFormat={formatValueLabel}
          aria-labelledby={labelId}
          aria-label={ariaLabel ?? t('search.fields.gradeRange')}
          getAriaValueText={formatValueLabel}
          sx={{
            // Match the inline picker's brand-rose selected tint.
            color: 'rgba(175, 45, 60, 0.85)',
            height: 6,
            padding: '20px 0',
            marginTop: '28px',
            '& .MuiSlider-rail': {
              opacity: 1,
              backgroundColor: 'rgba(128, 128, 128, 0.25)',
            },
            '& .MuiSlider-track': {
              border: 'none',
              backgroundColor: 'rgba(175, 45, 60, 0.45)',
            },
            '& .MuiSlider-thumb': {
              width: 22,
              height: 22,
              borderRadius: '50%',
              backgroundColor: 'rgba(175, 45, 60, 0.95)',
              boxShadow: '0 0 0 2px #8c4a52',
              transition: 'box-shadow 150ms ease',
              '&:hover, &.Mui-focusVisible, &.Mui-active': {
                boxShadow: '0 0 0 2px #8c4a52, 0 0 0 8px rgba(175, 45, 60, 0.16)',
              },
              '&::before': { display: 'none' },
            },
            '& .MuiSlider-mark': {
              backgroundColor: 'rgba(128, 128, 128, 0.45)',
              height: 6,
              width: 2,
            },
            '& .MuiSlider-markActive': {
              backgroundColor: 'rgba(175, 45, 60, 0.6)',
            },
            '& .MuiSlider-markLabel': {
              fontSize: 11,
              opacity: 0.6,
              top: 22,
            },
            // ValueLabel tooltip styling — pill-shaped, brand-rose ring, grade-colored text.
            '& .MuiSlider-valueLabel': {
              top: -2,
              backgroundColor: 'rgba(175, 45, 60, 0.32)',
              color: 'inherit',
              fontSize: 13,
              fontWeight: 700,
              padding: '4px 10px',
              minWidth: 36,
              borderRadius: 8,
              boxShadow: 'inset 0 0 0 2px #8c4a52',
              '&::before': { display: 'none' },
            },
            // Color each value label's text by which thumb it sits above.
            '& [data-index="0"] .MuiSlider-valueLabelLabel': {
              color: lowColor ?? 'inherit',
            },
            '& [data-index="1"] .MuiSlider-valueLabelLabel': {
              color: highColor ?? 'inherit',
            },
            // Dark mode: white-tint fill behind the rose ring (mirrors
            // inline-grade-picker.module.css `.pickerItemSelected` dark override).
            ...(isDark && {
              '& .MuiSlider-rail': {
                backgroundColor: 'rgba(255, 255, 255, 0.18)',
              },
              '& .MuiSlider-track': {
                backgroundColor: 'rgba(175, 45, 60, 0.55)',
              },
              '& .MuiSlider-valueLabel': {
                backgroundColor: 'rgba(255, 255, 255, 0.15)',
                boxShadow: 'inset 0 0 0 2px #8c4a52',
              },
            }),
          }}
        />
      </div>
    </div>
  );
};
