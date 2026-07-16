'use client';

// The gym-website leaderboard widget: the kiosk rail's period modes rendered
// full-width inside the embed shell. Deliberately WS-free — no presence hub,
// no graphql-ws client, no session mode — so an embed on a gym's homepage
// costs one anonymous HTTP query per scoped board every five minutes.

import React from 'react';
import { useTranslation } from 'react-i18next';
import { usePeriodLeaderboard } from '../leaderboard-rail/use-period-leaderboard';
import LeaderboardRow from '../leaderboard-rail/leaderboard-row';
import type { EmbedLeaderboardPeriod } from './embed-access';
import styles from './embed-leaderboard.module.css';

/** Rate-limit friendly: kiosks poll at 60s, embeds at 5 minutes. */
const EMBED_PERIOD_REFETCH_MS = 5 * 60_000;
/** Mirrors the kiosk rail: a one-climber "ranking" reads broken, show the
 * empty-state invitation instead. */
const MIN_RANKED_CLIMBERS = 2;

export default function EmbedLeaderboard({
  boardUuids,
  scopeName,
  period,
}: {
  /** The scoped boards' uuids (already viewer-visible; see embed-access.ts). */
  boardUuids: string[];
  /** Single-board scope's display name, or null when scoped to all boards. */
  scopeName: string | null;
  period: EmbedLeaderboardPeriod;
}) {
  const { t, i18n } = useTranslation('kiosk');
  const { rows, isError, updatedAtMs } = usePeriodLeaderboard(boardUuids, period, boardUuids.length > 0, {
    refetchIntervalMs: EMBED_PERIOD_REFETCH_MS,
  });

  const showError = isError && rows.length === 0;
  const showEmptyState = !showError && rows.length < MIN_RANKED_CLIMBERS;

  const updatedAtLabel =
    updatedAtMs === null
      ? null
      : new Date(updatedAtMs).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' });

  // Literal keys only (the i18n linter rejects t(variable)); 'day' is a
  // ROLLING 24 hours, so the copy says "Last 24 hours", never "Today".
  const periodTitle =
    period === 'day'
      ? t('leaderboard.periodLast24h')
      : period === 'week'
        ? t('leaderboard.periodWeek')
        : t('leaderboard.periodMonth');

  return (
    <section className={styles.panel}>
      <header className={styles.header}>
        <h1 className={styles.title}>{periodTitle}</h1>
        <span className={styles.scope}>{scopeName ?? t('leaderboard.allBoards')}</span>
      </header>

      {showError ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>{t('embed.leaderboard.errorTitle')}</p>
          <p className={styles.emptyBody}>{t('embed.leaderboard.errorBody')}</p>
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
        {updatedAtLabel !== null ? t('leaderboard.updatedAt', { time: updatedAtLabel }) : null}
      </footer>
    </section>
  );
}
