'use client';

// Identity strip under a board slot's art. Active wall: grade chip + climb
// name + "setter · lit by · angle" line. Idle wall: "Wall's open" + the last
// climb that was lit. Every line ellipsizes — nothing wraps or grows the slot.

import React from 'react';
import { useTranslation } from 'react-i18next';
import { getGradeColor, readableTextColor } from '@boardsesh/board-constants';
import type { BoardPresenceClimb } from '@boardsesh/shared-schema';
import styles from './board-identity.module.css';

function formatAngle(angle: number | null | undefined): string | null {
  if (angle === null || angle === undefined) return null;
  return `${angle}°`;
}

export default function BoardIdentity({
  boardName,
  boardAngle,
  climb,
  lastLitClimb,
}: {
  boardName: string;
  boardAngle: number;
  /** The climb shown on the wall right now, or null when the wall is clear. */
  climb: BoardPresenceClimb | null;
  /** Most recent climb from history, for the idle "last lit" line. */
  lastLitClimb: BoardPresenceClimb | null;
}) {
  const { t } = useTranslation('kiosk');

  const angleLabel = formatAngle(climb?.angle ?? boardAngle);
  const overline = angleLabel === null ? boardName : `${boardName} · ${angleLabel}`;

  if (climb === null) {
    const lastLitName = lastLitClimb?.name ?? null;
    const lastLitLine =
      lastLitName === null
        ? null
        : t('board.lastLit', {
            name: lastLitClimb?.grade ? `${lastLitName} · ${lastLitClimb.grade}` : lastLitName,
          });
    return (
      <div className={styles.identity}>
        <span className={styles.overline}>{overline}</span>
        <span className={styles.name}>{t('board.wallsOpen')}</span>
        {/* Reserve the third line (non-breaking space when empty) so idle and
         * active identity strips share one height, keeping the cards symmetric
         * across a preset — an idle wall's `flex:1` art can't grow past its peers. */}
        <span className={styles.secondary} aria-hidden={lastLitLine === null || undefined}>
          {lastLitLine ?? ' '}
        </span>
      </div>
    );
  }

  const gradeChipBackground = getGradeColor(climb.grade) ?? climb.gradeColor ?? null;
  const secondarySegments: string[] = [];
  if (climb.setter) {
    secondarySegments.push(climb.setter);
  }
  if (climb.sentByDisplayName) {
    secondarySegments.push(t('board.litBy', { name: climb.sentByDisplayName }));
  }

  return (
    <div className={styles.identity}>
      <span className={styles.overline}>{overline}</span>
      <span className={styles.nameRow}>
        {climb.grade ? (
          <span
            className={styles.gradeChip}
            style={
              gradeChipBackground === null
                ? undefined
                : { backgroundColor: gradeChipBackground, color: readableTextColor(gradeChipBackground) }
            }
          >
            {climb.grade}
          </span>
        ) : null}
        <span className={styles.name}>{climb.name ?? t('board.unnamedClimb')}</span>
      </span>
      {/* Reserve the third line (see the idle branch) so active and idle strips
       * share one height and the cards stay symmetric across a preset. */}
      <span className={styles.secondary} aria-hidden={secondarySegments.length === 0 || undefined}>
        {secondarySegments.length > 0 ? secondarySegments.join(' · ') : ' '}
      </span>
    </div>
  );
}
