'use client';

import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import ButtonBase from '@mui/material/ButtonBase';
import { useTranslation } from 'react-i18next';
import { useGradeFormat } from '@/app/hooks/use-grade-format';
import { useIsDarkMode } from '@/app/hooks/use-is-dark-mode';
import {
  ScrollIndicatorWrapper,
  useScrollIndicators,
  useStopHorizontalTouchPropagation,
} from '@/app/components/logbook/tick-controls';
import type { BoulderGrade } from '@/app/lib/board-data';
import baseStyles from './inline-grade-picker.module.css';
import styles from './grade-range-picker.module.css';

export type GradeRangePickerProps = {
  grades: readonly BoulderGrade[];
  /** undefined = "no lower bound" (filter clears that side). */
  minGradeId: number | undefined;
  /** undefined = "no upper bound". */
  maxGradeId: number | undefined;
  /** Both undefined = "Any" (filter cleared). */
  onChange: (next: { minGradeId: number | undefined; maxGradeId: number | undefined }) => void;
  ariaLabel?: string;
};

/**
 * In dark mode `getGradeColor` returns a pale text-readable variant. Pull the
 * hue and re-render at lower lightness so a filled band reads against the
 * dark surface. Light mode passes through.
 */
function saturateFill(color: string | undefined, isDark: boolean): string | undefined {
  if (!color || !isDark) return color;
  const match = color.match(/hsl\(\s*(-?\d+(?:\.\d+)?)/);
  if (!match) return color;
  const hue = Math.round(Number.parseFloat(match[1]));
  return `hsl(${hue}, 85%, 62%)`;
}

export const GradeRangePicker: React.FC<GradeRangePickerProps> = ({
  grades,
  minGradeId,
  maxGradeId,
  onChange,
  ariaLabel,
}) => {
  const { t } = useTranslation('climbs');
  const { formatGrade, getGradeColor } = useGradeFormat();
  const isDark = useIsDarkMode();
  const containerRef = useRef<HTMLDivElement>(null);

  useStopHorizontalTouchPropagation(containerRef);
  const { canScrollLeft, canScrollRight } = useScrollIndicators(containerRef);

  const isAny = minGradeId === undefined && maxGradeId === undefined;
  const isSingleGrade = minGradeId !== undefined && maxGradeId !== undefined && minGradeId === maxGradeId;
  const isRange = minGradeId !== undefined && maxGradeId !== undefined && minGradeId !== maxGradeId;

  const lowGrade = minGradeId !== undefined ? grades.find((g) => g.difficulty_id === minGradeId) : undefined;
  const highGrade = maxGradeId !== undefined ? grades.find((g) => g.difficulty_id === maxGradeId) : undefined;

  const lowLabel = lowGrade ? (formatGrade(lowGrade.difficulty_name) ?? lowGrade.v_grade) : '';
  const highLabel = highGrade ? (formatGrade(highGrade.difficulty_name) ?? highGrade.v_grade) : '';

  const summary = useMemo(() => {
    if (isAny) return t('search.fields.any');
    if (minGradeId !== undefined && maxGradeId !== undefined) {
      if (minGradeId === maxGradeId) return t('search.fields.gradeRangeOnly', { grade: lowLabel });
      return t('search.fields.gradeRangeBetween', { min: lowLabel, max: highLabel });
    }
    if (minGradeId !== undefined) return t('search.fields.gradeRangeAndUp', { grade: lowLabel });
    return t('search.fields.gradeRangeUpTo', { grade: highLabel });
  }, [isAny, minGradeId, maxGradeId, lowLabel, highLabel, t]);

  // Scroll a chip into view on mount when the picker opens with a bound set.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const targetId = minGradeId ?? maxGradeId;
    if (targetId === undefined) return;
    const targetEl = container.querySelector(`[data-grade-id="${targetId}"]`) as HTMLElement | null;
    if (!targetEl) return;
    const center = container.clientWidth / 2;
    const targetCenter = targetEl.offsetLeft + targetEl.offsetWidth / 2;
    container.scrollLeft = Math.max(0, Math.min(targetCenter - center, container.scrollWidth - container.clientWidth));
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Compute the gradient band's left/width within the scrollable row.
  const [bandStyle, setBandStyle] = useState<React.CSSProperties>({ display: 'none' });
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || isAny || minGradeId === undefined || maxGradeId === undefined) {
      setBandStyle({ display: 'none' });
      return;
    }
    const minEl = container.querySelector(`[data-grade-id="${minGradeId}"]`) as HTMLElement | null;
    const maxEl = container.querySelector(`[data-grade-id="${maxGradeId}"]`) as HTMLElement | null;
    if (!minEl || !maxEl) {
      setBandStyle({ display: 'none' });
      return;
    }
    const left = minEl.offsetLeft;
    const width = maxEl.offsetLeft + maxEl.offsetWidth - left;

    const lowColor = lowGrade ? getGradeColor(lowGrade.difficulty_name, isDark) : undefined;
    const highColor = highGrade ? getGradeColor(highGrade.difficulty_name, isDark) : undefined;
    const lowFill = saturateFill(lowColor, isDark) ?? lowColor;
    const highFill = saturateFill(highColor, isDark) ?? highColor;
    const background =
      lowFill && highFill && lowFill !== highFill
        ? `linear-gradient(to right, ${lowFill}, ${highFill})`
        : (lowFill ?? highFill ?? 'color-mix(in srgb, var(--color-primary) 45%, transparent)');

    setBandStyle({ left, width, background });
  }, [minGradeId, maxGradeId, isAny, lowGrade, highGrade, getGradeColor, isDark, grades]);

  const handleClear = useCallback(() => {
    onChange({ minGradeId: undefined, maxGradeId: undefined });
  }, [onChange]);

  // Tap rules (all no-modifier single taps):
  //   1. From "Any" → "V_X only" (collapse to single grade).
  //   2. From "V_X only", tap V_X → "Any" (clear). Matches inline picker.
  //   3. From "V_X only", tap V_Y (different chip) → range [min, max].
  //   4. From a range → "V_X only" (collapse to that single grade).
  // No long-press, no double-tap. Range is built by tapping two chips in
  // sequence; switching single grade from a range is one tap.
  const handleChipTap = useCallback(
    (gradeId: number) => {
      if (isRange) {
        onChange({ minGradeId: gradeId, maxGradeId: gradeId });
        return;
      }
      if (isSingleGrade) {
        if (minGradeId === gradeId) {
          handleClear();
          return;
        }
        const otherId = minGradeId as number;
        const lo = Math.min(otherId, gradeId);
        const hi = Math.max(otherId, gradeId);
        onChange({ minGradeId: lo, maxGradeId: hi });
        return;
      }
      // "Any" or any other state — collapse to single grade.
      onChange({ minGradeId: gradeId, maxGradeId: gradeId });
    },
    [isRange, isSingleGrade, minGradeId, onChange, handleClear],
  );

  const inRange = (gradeId: number): boolean => {
    if (minGradeId === undefined || maxGradeId === undefined) return false;
    return gradeId >= minGradeId && gradeId <= maxGradeId;
  };
  const isEndpoint = (gradeId: number): boolean => gradeId === minGradeId || gradeId === maxGradeId;

  return (
    <div className={styles.wrapper}>
      <div className={styles.labelRow}>
        <span className={styles.fieldLabel}>{t('search.fields.gradeRange')}</span>
        <span className={styles.fieldSummary}>{summary}</span>
      </div>
      <ScrollIndicatorWrapper canScrollLeft={canScrollLeft} canScrollRight={canScrollRight}>
        <div
          ref={containerRef}
          className={styles.pickerRow}
          role="listbox"
          aria-label={ariaLabel ?? t('search.fields.gradeRange')}
          data-scrollable-picker
        >
          <div className={styles.gradientBand} style={bandStyle} aria-hidden="true" />
          <ButtonBase
            onClick={handleClear}
            className={`${baseStyles.pickerItem} ${isAny ? baseStyles.pickerItemSelected : ''}`}
            aria-label={t('search.fields.any')}
            aria-selected={isAny}
            role="option"
          >
            <span className={baseStyles.pickerClear}>—</span>
          </ButtonBase>
          {grades.map((grade) => {
            const formatted = formatGrade(grade.difficulty_name) ?? grade.v_grade;
            const color = getGradeColor(grade.difficulty_name, isDark);
            const endpoint = isEndpoint(grade.difficulty_id);
            const inside = !endpoint && inRange(grade.difficulty_id);
            const className = [
              baseStyles.pickerItem,
              endpoint ? baseStyles.pickerItemSelected : '',
              inside ? styles.inRange : '',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <ButtonBase
                key={grade.difficulty_id}
                data-grade-id={grade.difficulty_id}
                onClick={() => handleChipTap(grade.difficulty_id)}
                className={className}
                aria-label={formatted}
                aria-selected={endpoint}
                role="option"
              >
                <span
                  className={baseStyles.pickerGrade}
                  {...(color ? { style: { '--grade-color': color } as React.CSSProperties } : {})}
                >
                  {formatted}
                </span>
              </ButtonBase>
            );
          })}
        </div>
      </ScrollIndicatorWrapper>
    </div>
  );
};
