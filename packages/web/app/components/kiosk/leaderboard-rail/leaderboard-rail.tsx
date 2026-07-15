'use client';

// The kiosk's single leaderboard rail. Header (period title + scope) → rows
// (rank, avatar, name, sends; top-3 accent; ≤10) → footer (live dot for
// session mode / last-updated for period modes). Always renders at full rail
// size when configured — fewer than 2 ranked climbers (or zero scoped boards)
// swaps the rows for empty-state copy without any layout jump.

import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { GymKioskBoard } from '@boardsesh/shared-schema';
import type { KioskLeaderboardConfig } from '../kiosk-view-model';
import { useSessionLeaderboard } from './use-session-leaderboard';
import { usePeriodLeaderboard, type KioskPeriodLeaderboardPeriod } from './use-period-leaderboard';
import LeaderboardRow from './leaderboard-row';
import styles from './leaderboard-rail.module.css';

const EMPTY_BOARD_IDS: number[] = [];
const MIN_RANKED_CLIMBERS = 2;

export default function LeaderboardRail({
  leaderboard,
  boards,
}: {
  leaderboard: KioskLeaderboardConfig;
  /** The kiosk's RESOLVED boards (slot order) — the scope universe. */
  boards: GymKioskBoard[];
}) {
  const { t, i18n } = useTranslation('kiosk');
  const isSession = leaderboard.period === 'session';

  const scopedBoards = useMemo(
    () =>
      leaderboard.boardUuid === null ? boards : boards.filter((board) => board.boardUuid === leaderboard.boardUuid),
    [boards, leaderboard.boardUuid],
  );
  const scopedBoardIds = useMemo(() => scopedBoards.map((board) => board.boardId), [scopedBoards]);
  const scopedBoardUuids = useMemo(() => scopedBoards.map((board) => board.boardUuid), [scopedBoards]);

  // Both hooks always run (rules of hooks); each is inert for the other mode.
  const sessionRows = useSessionLeaderboard(isSession ? scopedBoardIds : EMPTY_BOARD_IDS);
  const periodResult = usePeriodLeaderboard(
    scopedBoardUuids,
    (isSession ? 'week' : leaderboard.period) as KioskPeriodLeaderboardPeriod,
    !isSession,
  );

  const rows = isSession ? sessionRows : periodResult.rows;
  // Period fetches failed with nothing cached (backend blip, or a 'day' rail
  // against a backend that predates #3629): honest "unavailable" copy instead
  // of a fake "no sends yet". Stale rows from an earlier success keep showing.
  const showUnavailableState = !isSession && periodResult.isError && rows.length === 0;
  const showEmptyState = scopedBoards.length === 0 || rows.length < MIN_RANKED_CLIMBERS;

  const periodTitle =
    leaderboard.period === 'session'
      ? t('leaderboard.periodSession')
      : leaderboard.period === 'day'
        ? t('leaderboard.periodLast24h')
        : leaderboard.period === 'week'
          ? t('leaderboard.periodWeek')
          : t('leaderboard.periodMonth');

  const scopeLabel =
    leaderboard.boardUuid !== null && scopedBoards.length === 1 ? scopedBoards[0].name : t('leaderboard.allBoards');

  const updatedAtLabel =
    periodResult.updatedAtMs === null
      ? null
      : new Date(periodResult.updatedAtMs).toLocaleTimeString(i18n.language, {
          hour: '2-digit',
          minute: '2-digit',
        });

  return (
    <section className={styles.rail}>
      <header className={styles.header}>
        <h2 className={styles.title}>{periodTitle}</h2>
        <span className={styles.scope}>{scopeLabel}</span>
      </header>

      {showUnavailableState ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>{t('leaderboard.unavailableTitle')}</p>
          <p className={styles.emptyBody}>{t('leaderboard.unavailableBody')}</p>
        </div>
      ) : showEmptyState ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>{t('leaderboard.emptyTitle')}</p>
          <p className={styles.emptyBody}>{t('leaderboard.emptyBody')}</p>
        </div>
      ) : (
        <ol className={styles.rows}>
          {rows.map((row, index) => (
            <LeaderboardRow key={row.key} rank={index + 1} row={row} />
          ))}
        </ol>
      )}

      <footer className={styles.footer}>
        {isSession ? (
          <>
            <span className={styles.liveDot} aria-hidden="true" />
            {t('leaderboard.live')}
          </>
        ) : updatedAtLabel !== null ? (
          t('leaderboard.updatedAt', { time: updatedAtLabel })
        ) : null}
      </footer>
    </section>
  );
}
