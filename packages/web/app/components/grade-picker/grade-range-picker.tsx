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

const LONG_PRESS_MS = 350;

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
  const [anchorGradeId, setAnchorGradeId] = useState<number | undefined>(undefined);

  useStopHorizontalTouchPropagation(containerRef);
  const { canScrollLeft, canScrollRight } = useScrollIndicators(containerRef);

  // Note: `anchorGradeId` is purely local state. We don't reset it when
  // bounds change externally — if the user is mid-interaction, their pending
  // anchor should outlive an unrelated URL update. The tap handlers below
  // clear it when the user resolves the gesture (set range / clear / tap-out).

  const isAny = minGradeId === undefined && maxGradeId === undefined;
  const isSingleGrade = minGradeId !== undefined && maxGradeId !== undefined && minGradeId === maxGradeId;

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

  // Scroll a chip into view on mount when the slider opens with a bound set.
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
    setAnchorGradeId(undefined);
  }, [onChange]);

  // Tap a chip — single-grade primary gesture. When in anchor mode (after a
  // long-press), the second tap sets the range instead.
  const handleChipTap = useCallback(
    (gradeId: number) => {
      if (anchorGradeId !== undefined) {
        const lo = Math.min(anchorGradeId, gradeId);
        const hi = Math.max(anchorGradeId, gradeId);
        onChange({ minGradeId: lo, maxGradeId: hi });
        setAnchorGradeId(undefined);
        return;
      }
      // Tap the currently-selected single chip → clear (matches the inline
      // grade picker's "tap selected to deselect" muscle memory).
      if (isSingleGrade && minGradeId === gradeId) {
        handleClear();
        return;
      }
      // Default: collapse to that single grade.
      onChange({ minGradeId: gradeId, maxGradeId: gradeId });
    },
    [anchorGradeId, isSingleGrade, minGradeId, onChange, handleClear],
  );

  // Long-press → anchor mode. Subtle pulse on the chip; second tap on a
  // different chip sets the range. Useful for users who want a range without
  // a precision drag.
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks which chip the long-press fired on, so we only suppress the
  // synthesized click on THAT chip (the long-press of V6 shouldn't swallow
  // a subsequent tap on V11).
  const longPressedChipRef = useRef<number | null>(null);

  const cancelLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const handlePointerDown = useCallback(
    (gradeId: number) => {
      cancelLongPress();
      longPressTimerRef.current = setTimeout(() => {
        longPressedChipRef.current = gradeId;
        setAnchorGradeId(gradeId);
        // Anchor mode is purely UI — the filter doesn't change until the
        // user taps a second chip. Avoids a flash of "V6 only" filtering
        // between the long-press and the second tap.
      }, LONG_PRESS_MS);
    },
    [cancelLongPress],
  );

  const handleChipClick = useCallback(
    (gradeId: number) => {
      cancelLongPress();
      if (longPressedChipRef.current === gradeId) {
        // The long-press just fired on this chip; the synthesized click
        // that follows would re-process the same tap. Suppress it.
        longPressedChipRef.current = null;
        return;
      }
      // A click on a *different* chip — long-press's chip flag is stale,
      // clear it so future taps on its chip aren't suppressed.
      longPressedChipRef.current = null;
      handleChipTap(gradeId);
    },
    [cancelLongPress, handleChipTap],
  );

  // Cleanup the timer on unmount.
  useEffect(() => () => cancelLongPress(), [cancelLongPress]);

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
            const anchored = anchorGradeId === grade.difficulty_id;
            const className = [
              baseStyles.pickerItem,
              endpoint ? baseStyles.pickerItemSelected : '',
              inside ? styles.inRange : '',
              anchored ? styles.anchored : '',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <ButtonBase
                key={grade.difficulty_id}
                data-grade-id={grade.difficulty_id}
                onPointerDown={() => handlePointerDown(grade.difficulty_id)}
                onPointerUp={cancelLongPress}
                onPointerLeave={cancelLongPress}
                onPointerCancel={cancelLongPress}
                onClick={() => handleChipClick(grade.difficulty_id)}
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
