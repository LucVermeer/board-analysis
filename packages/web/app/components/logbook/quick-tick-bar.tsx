'use client';

import React, { useState, useCallback, useEffect, useMemo, useImperativeHandle, useRef, forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import Stack from '@mui/material/Stack';
import KeyboardArrowUpOutlined from '@mui/icons-material/KeyboardArrowUpOutlined';
import KeyboardArrowDownOutlined from '@mui/icons-material/KeyboardArrowDownOutlined';
import ChatBubbleOutlineOutlined from '@mui/icons-material/ChatBubbleOutlineOutlined';
import type { Angle, Climb, BoardDetails } from '@/app/lib/types';
import { useBoardProvider } from '../board-provider/board-provider-context';
import { getGradesForBoard } from '@/app/lib/board-data';
import { loadTickDraft } from '@/app/lib/tick-draft-db';
import { useTickSave, buildTickTarget, type TickTarget } from '@/app/hooks/use-tick-save';
import type { TickStatus } from '@/app/hooks/use-logbook';
import {
  TickControls,
  TickGradeButton,
  InlineStarPicker,
  InlineGradePicker,
  InlineTriesPicker,
  type ExpandedControl,
} from './tick-controls';
import styles from './quick-tick-bar.module.css';

export type QuickTickBarProps = {
  currentClimb: Climb | null;
  angle: Angle;
  boardDetails: BoardDetails;
  onSave: () => void;
  /** Called when a save fails so the parent can show feedback. */
  onError?: () => void;
  /** Called when a draft is restored from a previous failed save. */
  onDraftRestored?: (comment: string) => void;
  /** Called when the flash state changes (true = will log as flash, false = send/attempt). */
  onIsFlashChange?: (isFlash: boolean) => void;
  /** Called when the ascent type changes (flash, send, or attempt). */
  onAscentTypeChange?: (ascentType: TickStatus) => void;
  /** Current comment text. Owned by the parent so the comment field can live
   *  outside this bar (above the queue control bar) without causing reflow. */
  comment: string;
  /** Comment input element rendered by the parent — placed in the row next to tick controls. */
  commentSlot: React.ReactNode;
  /** Whether the tick bar is in expanded mode (all pickers visible). */
  expanded?: boolean;
  /** Toggle expanded/collapsed state. */
  onExpandedChange?: (expanded: boolean) => void;
  /** Expanded-mode comment slot — taller, for the expanded layout. */
  expandedCommentSlot?: React.ReactNode;
};

export type QuickTickBarHandle = {
  /** Trigger a save using the selected ascent type. Pass the origin element for confetti positioning. */
  save: (originElement?: HTMLElement | null) => void;
  /** Trigger a save as attempt. Pass the origin element for confetti positioning. */
  saveAttempt: (originElement?: HTMLElement | null) => void;
};

/**
 * Stateful tick entry wrapper. Manages the tick target snapshot, form state
 * (quality, difficulty, attempts, ascent type), expansion state, and save logic.
 *
 * Compact layout mirrors the queue control bar below:
 *   [comment (flex:1) + grade] [stars + tries]
 *
 * Expanded layout shows all pickers simultaneously with icon+label on the left.
 */
export const QuickTickBar = forwardRef<QuickTickBarHandle, QuickTickBarProps>(
  (
    {
      currentClimb,
      angle,
      boardDetails,
      onSave,
      onError,
      onDraftRestored,
      onIsFlashChange,
      onAscentTypeChange,
      comment,
      commentSlot,
      expanded = false,
      onExpandedChange,
      expandedCommentSlot,
    },
    ref,
  ) => {
    const { t } = useTranslation('profile');
    const { logbook } = useBoardProvider();

    // Snapshot the target climb the first time we get a non-null climb.
    const tickTargetTaken = useRef(false);
    const [tickTarget, setTickTarget] = useState<TickTarget | null>(() => {
      if (currentClimb) {
        tickTargetTaken.current = true;
        return buildTickTarget(currentClimb, angle, boardDetails, logbook);
      }
      return null;
    });
    useEffect(() => {
      if (!tickTargetTaken.current && currentClimb) {
        tickTargetTaken.current = true;
        setTickTarget(buildTickTarget(currentClimb, angle, boardDetails, logbook));
      }
    }, [currentClimb, angle, boardDetails, logbook]);

    const [quality, setQuality] = useState<number | null>(null);
    const [difficulty, setDifficulty] = useState<number | undefined>(undefined);
    const [attemptCount, setAttemptCount] = useState<number>(1);
    const [expandedControl, setExpandedControl] = useState<ExpandedControl>(null);

    // Ascent type is derived from state: flash on 1st try with no prior history, else send.
    const ascentType: TickStatus = tickTarget && !tickTarget.hasPriorHistory && attemptCount === 1 ? 'flash' : 'send';

    // Report ascent type to the parent so tick buttons can update their appearance.
    const isFlash = ascentType === 'flash';
    useEffect(() => {
      onIsFlashChange?.(isFlash);
    }, [isFlash, onIsFlashChange]);

    useEffect(() => {
      onAscentTypeChange?.(ascentType);
    }, [ascentType, onAscentTypeChange]);

    // Restore draft values from a previous failed save for this climb.
    const draftLoaded = useRef(false);
    useEffect(() => {
      if (!tickTarget || draftLoaded.current) return;
      draftLoaded.current = true;
      let cancelled = false;
      void loadTickDraft(tickTarget.climb.uuid, Number(tickTarget.angle)).then((draft) => {
        if (cancelled || !draft) return;
        setQuality(draft.quality);
        setDifficulty(draft.difficulty);
        setAttemptCount(draft.attemptCount);
        if (draft.comment) {
          onDraftRestored?.(draft.comment);
        }
      });
      return () => {
        cancelled = true;
      };
    }, [tickTarget, onDraftRestored]);

    // Track which picker was last open so we can keep it mounted during collapse.
    const [lastExpandedControl, setLastExpandedControl] = useState<ExpandedControl>(null);
    const [pickerVisible, setPickerVisible] = useState(false);

    useEffect(() => {
      if (expandedControl) {
        setLastExpandedControl(expandedControl);
        setPickerVisible(true);
      } else {
        const timer = setTimeout(() => setPickerVisible(false), 200);
        return () => clearTimeout(timer);
      }
    }, [expandedControl]);

    const renderedControl = expandedControl ?? (pickerVisible ? lastExpandedControl : null);

    // Collapse any open individual picker when entering expanded mode.
    useEffect(() => {
      if (expanded) setExpandedControl(null);
    }, [expanded]);

    const gradeButtonRef = useRef<HTMLButtonElement>(null);
    const triesButtonRef = useRef<HTMLButtonElement>(null);

    const grades = useMemo(() => getGradesForBoard(boardDetails.board_name), [boardDetails.board_name]);
    const currentGradeId = difficulty;

    const consensusGradeId = useMemo(() => {
      const source = tickTarget?.climb.difficulty;
      if (!source) return undefined;
      return grades.find((g) => g.difficulty_name === source)?.difficulty_id;
    }, [tickTarget, grades]);

    // Picker selection handlers.
    const handleStarSelect = useCallback(
      (value: number | null) => {
        setQuality(value);
        if (!expanded) setExpandedControl(null);
      },
      [expanded],
    );

    const handleGradeSelect = useCallback(
      (value: number | undefined) => {
        setDifficulty(value);
        if (!expanded) setExpandedControl(null);
      },
      [expanded],
    );

    const handleTriesSelect = useCallback(
      (value: number) => {
        setAttemptCount(value);
        if (!expanded) setExpandedControl(null);
      },
      [expanded],
    );

    const { save, saveAttempt } = useTickSave({
      tickTarget,
      quality,
      difficulty,
      attemptCount,
      comment,
      ascentType,
      onSave,
      onError,
    });

    useImperativeHandle(
      ref,
      () => ({
        save,
        saveAttempt,
      }),
      [save, saveAttempt],
    );

    return (
      <div data-testid="quick-tick-bar" className={styles.tickBar}>
        {/* Expand/collapse header — styled to match the session header ("Start sesh") strip.
          Also serves as the swipe-hint drag handle. */}
        {onExpandedChange && (
          <div
            className={styles.expandHeader}
            onClick={() => onExpandedChange(!expanded)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') onExpandedChange(!expanded);
            }}
            aria-label={expanded ? 'Collapse tick bar' : 'Expand tick bar'}
          >
            {expanded ? (
              <KeyboardArrowDownOutlined sx={{ fontSize: 16, opacity: 0.7 }} />
            ) : (
              <KeyboardArrowUpOutlined sx={{ fontSize: 16, opacity: 0.7 }} />
            )}
            <span className={styles.expandLabel}>{expanded ? 'collapse' : 'expand'}</span>
            <div className={styles.expandDragBar} aria-hidden="true">
              <div className={styles.expandDragBarPill} />
            </div>
          </div>
        )}

        {/* Expanded mode — all pickers visible at once with labels.
          Only mount content when expanded to avoid duplicate picker DOM elements
          that would confuse screen reader queries and tests. */}
        {expanded && (
          <div className={`${styles.expandedPanel} ${styles.expandedPanelOpen}`}>
            <div className={styles.expandedPanelContent}>
              {/* Grade row */}
              <div className={styles.labeledRow}>
                <span className={styles.labeledRowLabel}>{t('logbook.feed.grade')}</span>
                <div className={styles.labeledRowPicker}>
                  <InlineGradePicker
                    grades={grades}
                    currentGradeId={currentGradeId}
                    focusGradeId={consensusGradeId}
                    onSelect={handleGradeSelect}
                    gradeButtonRef={gradeButtonRef}
                  />
                </div>
              </div>

              {/* Tries row */}
              <div className={styles.labeledRow}>
                <span className={styles.labeledRowLabel}>{t('logbook.feed.tries')}</span>
                <div className={styles.labeledRowPicker}>
                  <InlineTriesPicker
                    attemptCount={attemptCount}
                    onSelect={handleTriesSelect}
                    triesButtonRef={triesButtonRef}
                  />
                </div>
              </div>

              {/* Stars row — left-aligned since picker is shorter */}
              <div className={styles.labeledRow}>
                <span className={styles.labeledRowLabel}>{t('logbook.feed.stars')}</span>
                <div className={styles.labeledRowPickerStart}>
                  <InlineStarPicker quality={quality} onSelect={handleStarSelect} />
                </div>
              </div>

              {/* Comment row — same layout as other labeled rows */}
              {expandedCommentSlot && (
                <div className={styles.labeledRow}>
                  <span className={styles.labeledRowLabel}>
                    <ChatBubbleOutlineOutlined sx={{ fontSize: 14 }} />
                  </span>
                  <div className={styles.labeledRowPicker}>{expandedCommentSlot}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Compact mode — single picker panel + controls row (hidden when expanded) */}
        {!expanded && (
          <>
            <div className={`${styles.pickerPanel} ${expandedControl ? styles.pickerPanelExpanded : ''}`}>
              <div className={styles.pickerPanelContent}>
                {renderedControl === 'stars' && <InlineStarPicker quality={quality} onSelect={handleStarSelect} />}
                {renderedControl === 'grade' && (
                  <InlineGradePicker
                    grades={grades}
                    currentGradeId={currentGradeId}
                    focusGradeId={consensusGradeId}
                    onSelect={handleGradeSelect}
                    gradeButtonRef={gradeButtonRef}
                  />
                )}
                {renderedControl === 'tries' && (
                  <InlineTriesPicker
                    attemptCount={attemptCount}
                    onSelect={handleTriesSelect}
                    triesButtonRef={triesButtonRef}
                  />
                )}
              </div>
            </div>

            <div className={styles.controlsRow}>
              <div className={styles.leftSection}>
                <div role="group" onFocus={() => setExpandedControl(null)} className={styles.commentWrapper}>
                  {commentSlot}
                </div>
                <TickGradeButton
                  ref={gradeButtonRef}
                  difficulty={difficulty}
                  displayedGrades={grades}
                  expandedControl={expandedControl}
                  onExpandedControlChange={setExpandedControl}
                />
              </div>

              <div className={styles.rightControls}>
                <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                  <TickControls
                    quality={quality}
                    attemptCount={attemptCount}
                    expandedControl={expandedControl}
                    onExpandedControlChange={setExpandedControl}
                    triesButtonRef={triesButtonRef}
                  />
                </Stack>
              </div>
            </div>
          </>
        )}
      </div>
    );
  },
);

QuickTickBar.displayName = 'QuickTickBar';
