'use client';

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import ButtonBase from '@mui/material/ButtonBase';
import { useTranslation } from 'react-i18next';
import { useGradeFormat } from '@/app/hooks/use-grade-format';
import { useIsDarkMode } from '@/app/hooks/use-is-dark-mode';
import {
  ScrollIndicatorWrapper,
  useScrollIndicators,
  useStopHorizontalTouchPropagation,
} from '@/app/components/logbook/tick-controls';
import {
  RANGE_EXTEND_WINDOW_MS,
  computeGradeTap,
  isAnyGrade,
  isSingleGrade,
  isRangeGrade,
  isGradeInRange,
  isGradeEndpoint,
  type GradeBound,
} from '@boardsesh/climb-filters';
import type { BoulderGrade } from '@/app/lib/board-data';
import baseStyles from './inline-grade-picker.module.css';
import styles from './grade-range-picker.module.css';

/**
 * Optional metadata emitted with `onChange` calls. Lets the call site fold
 * picker-internal context into analytics without the picker itself knowing
 * about the analytics layer.
 */
export type GradeRangeChangeMeta = {
  /**
   * Set only when the user tapped a different chip from the currently-selected
   * single grade. `true` = the second tap landed inside the
   * RANGE_EXTEND_WINDOW_MS window from the first tap and was treated as range
   * extension. `false` = the window had expired so we switched single grade
   * (avoiding an accidental range). Undefined for all other rules.
   */
  extendedRangeWithinWindow?: boolean;
};

export type GradeRangePickerProps = {
  grades: readonly BoulderGrade[];
  /** undefined = "no lower bound" (filter clears that side). */
  minGradeId: number | undefined;
  /** undefined = "no upper bound". */
  maxGradeId: number | undefined;
  /** Both undefined = "Any" (filter cleared). */
  onChange: (
    next: { minGradeId: number | undefined; maxGradeId: number | undefined },
    meta?: GradeRangeChangeMeta,
  ) => void;
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

  const bound: GradeBound = { minGradeId, maxGradeId };
  const isAny = isAnyGrade(bound);
  const isSingle = isSingleGrade(bound);
  const isRange = isRangeGrade(bound);

  // Timestamp of the most recent transition INTO a single-grade state.
  // Re-stamps on every bounds change so each fresh single-grade selection
  // starts its own 3-second extension window. Cleared when state is not a
  // single grade so we don't accidentally extend from a stale window after
  // the user explored a range and came back.
  const singleGradeSelectedAtRef = useRef<number | undefined>(isSingle ? Date.now() : undefined);
  useEffect(() => {
    singleGradeSelectedAtRef.current = isSingle ? Date.now() : undefined;
  }, [minGradeId, maxGradeId, isSingle]);

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

  // Centre the selected chip when it's not visible. Runs on mount and on
  // external bounds changes (URL nav, "Clear all" then reapply) — but skips
  // when the user just tapped a visible chip, so the row doesn't jump under
  // their finger.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const targetId = minGradeId ?? maxGradeId;
    if (targetId === undefined) return;
    const targetEl = container.querySelector(`[data-grade-id="${targetId}"]`) as HTMLElement | null;
    if (!targetEl) return;
    const isOffscreen =
      targetEl.offsetLeft + targetEl.offsetWidth < container.scrollLeft ||
      targetEl.offsetLeft > container.scrollLeft + container.clientWidth;
    if (!isOffscreen) return;
    const center = container.clientWidth / 2;
    const targetCenter = targetEl.offsetLeft + targetEl.offsetWidth / 2;
    container.scrollLeft = Math.max(0, Math.min(targetCenter - center, container.scrollWidth - container.clientWidth));
  }, [minGradeId, maxGradeId]);

  // Compute the gradient band's left/width within the scrollable row. Only
  // visible when a true range is set — for a single-grade selection the chip
  // ring + tint already carries the identity; a 1-chip-wide band underneath
  // reads as a render glitch.
  const [bandStyle, setBandStyle] = useState<React.CSSProperties>({ display: 'none' });
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || !isRange || minGradeId === undefined || maxGradeId === undefined) {
      setBandStyle({ display: 'none' });
      return;
    }
    const minEl = container.querySelector(`[data-grade-id="${minGradeId}"]`) as HTMLElement | null;
    const maxEl = container.querySelector(`[data-grade-id="${maxGradeId}"]`) as HTMLElement | null;
    if (!minEl || !maxEl) {
      setBandStyle({ display: 'none' });
      return;
    }
    // Extend the band to the chips' outer edges so it visually abuts the
    // endpoint chips' rose ring (the ring is `inset 0 0 0 2px` on the chip,
    // so the band's edge sliding under the chip lands right at the ring).
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
  }, [minGradeId, maxGradeId, isRange, lowGrade, highGrade, getGradeColor, isDark, grades]);

  const handleClear = useCallback(() => {
    onChange({ minGradeId: undefined, maxGradeId: undefined });
  }, [onChange]);

  // Tap rules (all no-modifier single taps):
  //   1. From "Any" → "V_X only" (collapse to single grade).
  //   2. From "V_X only", tap V_X → "Any" (clear). Matches inline picker.
  //   3. From "V_X only", tap V_Y (different chip) → range [min, max].
  //   4. From a range, tap an *endpoint* → trim the range (drop that endpoint
  //      and shrink). When the trim collapses to one grade, leave it as a
  //      single-grade selection.
  //   5. From a range, tap an *interior* chip → "V_X only" (collapse).
  //   6. From a range, tap a chip outside the range → "V_X only" (collapse).
  // No long-press, no double-tap. Range is built by tapping two chips in
  // sequence; switching single grade from a range is one tap. The bounds math
  // lives in @boardsesh/climb-filters/computeGradeTap; this component owns the
  // timer, the within-window decision, and re-emitting through onChange.
  const handleChipTap = useCallback(
    (gradeId: number) => {
      // Rule 3 is time-gated: rapid taps after a fresh single-grade pick build
      // a range; slow taps switch single grade. Avoids accidentally creating a
      // range during the user's primary single-grade workflow (warm-up V4,
      // then climb V6 30s later — V6 should *replace*, not extend).
      const selectedAt = singleGradeSelectedAtRef.current;
      const withinWindow = selectedAt !== undefined && Date.now() - selectedAt < RANGE_EXTEND_WINDOW_MS;
      const gradeIds = grades.map((grade) => grade.difficulty_id);
      const { next, meta } = computeGradeTap({ minGradeId, maxGradeId }, gradeIds, gradeId, withinWindow);
      onChange(next, meta);
    },
    [minGradeId, maxGradeId, grades, onChange],
  );

  const inRange = (gradeId: number): boolean => isGradeInRange(bound, gradeId);
  const isEndpoint = (gradeId: number): boolean => isGradeEndpoint(bound, gradeId);

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
            className={`${baseStyles.pickerItem} ${styles.chip} ${styles.clearChip}`}
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
              styles.chip,
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
