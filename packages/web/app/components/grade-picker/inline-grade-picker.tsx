'use client';

import React, { useLayoutEffect, useRef } from 'react';
import ButtonBase from '@mui/material/ButtonBase';
import { useTranslation } from 'react-i18next';
import { useGradeFormat } from '@/app/hooks/use-grade-format';
import { useIsDarkMode } from '@/app/hooks/use-is-dark-mode';
import {
  ScrollIndicatorWrapper,
  useScrollIndicators,
  useStopHorizontalTouchPropagation,
} from '@/app/components/logbook/tick-controls';
import styles from '@/app/components/logbook/tick-controls.module.css';

export type InlineGradePickerProps = {
  grades: readonly { difficulty_id: number; difficulty_name: string; v_grade: string }[];
  currentGradeId: number | undefined;
  /**
   * Tick-flow consensus hint. When `currentGradeId` is unset, this grade gets
   * the dashed "focus" outline AND the picker scrolls to it. The aria-label
   * gains a "(consensus)" suffix — only correct for the tick context.
   */
  focusGradeId?: number;
  /**
   * Scroll-only target. Used by filter call sites that want the picker to
   * open centered on the last grade the user picked, without the consensus
   * outline or aria suffix. Lower priority than `focusGradeId`.
   */
  scrollToGradeId?: number;
  onSelect: (value: number | undefined) => void;
  /** Ref to the grade button for scroll alignment in compact mode. */
  gradeButtonRef?: React.RefObject<HTMLButtonElement | null>;
  /** Listbox aria-label; defaults to the tick-flow "grade override" label. */
  ariaLabel?: string;
  /** Clear-chip aria-label; defaults to the tick-flow "clear grade override" label. */
  clearLabel?: string;
  /** Omit the leading "—" clear chip; for call sites where a grade is always required. */
  hideClear?: boolean;
};

export const InlineGradePicker: React.FC<InlineGradePickerProps> = ({
  grades,
  currentGradeId,
  focusGradeId,
  scrollToGradeId,
  onSelect,
  gradeButtonRef,
  ariaLabel,
  clearLabel,
  hideClear,
}) => {
  const { t } = useTranslation('climbs');
  const { formatGrade, getGradeColor } = useGradeFormat();
  const isDark = useIsDarkMode();
  const containerRef = useRef<HTMLDivElement>(null);

  useStopHorizontalTouchPropagation(containerRef);
  const { canScrollLeft, canScrollRight } = useScrollIndicators(containerRef);

  // On mount, scroll so the relevant grade is visible. Priority:
  // currentGradeId (the actual selection) → focusGradeId (tick consensus)
  // → scrollToGradeId (filter "open on the user's last grade").
  const scrollTargetId = currentGradeId ?? focusGradeId ?? scrollToGradeId;
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || scrollTargetId === undefined) return;

    const targetEl = container.querySelector(`[data-grade-id="${scrollTargetId}"]`) as HTMLElement | null;
    if (!targetEl) return;

    const containerRect = container.getBoundingClientRect();
    const gradeButton = gradeButtonRef?.current;

    const alignCenter = gradeButton
      ? gradeButton.getBoundingClientRect().left + gradeButton.getBoundingClientRect().width / 2 - containerRect.left
      : container.clientWidth / 2;

    const targetItemCenter = targetEl.offsetLeft + targetEl.offsetWidth / 2;
    const targetScrollLeft = targetItemCenter - alignCenter;
    const maxScroll = container.scrollWidth - container.clientWidth;
    container.scrollLeft = Math.max(0, Math.min(targetScrollLeft, maxScroll));
  }, [scrollTargetId, gradeButtonRef]);

  return (
    <ScrollIndicatorWrapper canScrollLeft={canScrollLeft} canScrollRight={canScrollRight}>
      <div
        ref={containerRef}
        className={styles.pickerRowScrollable}
        role="listbox"
        aria-label={ariaLabel ?? t('tick.controls.gradeOverride')}
        data-scrollable-picker
      >
        {!hideClear && (
          <ButtonBase
            onClick={() => onSelect(undefined)}
            className={`${styles.pickerItem} ${currentGradeId === undefined ? styles.pickerItemSelected : ''}`}
            aria-label={clearLabel ?? t('tick.controls.clearGradeOverride')}
            aria-selected={currentGradeId === undefined}
            role="option"
          >
            <span className={styles.pickerClear}>—</span>
          </ButtonBase>
        )}
        {grades.map((grade) => {
          const formatted = formatGrade(grade.difficulty_name) ?? grade.v_grade;
          const color = getGradeColor(grade.difficulty_name, isDark);
          const isSelected = grade.difficulty_id === currentGradeId;
          const isFocused = !isSelected && currentGradeId === undefined && grade.difficulty_id === focusGradeId;
          return (
            <ButtonBase
              key={grade.difficulty_id}
              data-grade-id={grade.difficulty_id}
              onClick={() => onSelect(isSelected && !hideClear ? undefined : grade.difficulty_id)}
              className={`${styles.pickerItem} ${isSelected ? styles.pickerItemSelected : ''} ${isFocused ? styles.pickerItemFocused : ''}`}
              aria-label={isFocused ? `${formatted} (consensus)` : formatted}
              aria-selected={isSelected}
              role="option"
            >
              <span
                className={styles.pickerGrade}
                {...(color ? { style: { '--grade-color': color } as React.CSSProperties } : {})}
              >
                {formatted}
              </span>
            </ButtonBase>
          );
        })}
      </div>
    </ScrollIndicatorWrapper>
  );
};
