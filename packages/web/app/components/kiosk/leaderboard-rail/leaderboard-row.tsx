'use client';

// One ranked climber in the kiosk leaderboard rail.

import React from 'react';
import { useTranslation } from 'react-i18next';
import type { KioskLeaderboardRowData } from './leaderboard-model';
import styles from './leaderboard-row.module.css';

const TOP_RANKS = 3;

export default function LeaderboardRow({ rank, row }: { rank: number; row: KioskLeaderboardRowData }) {
  const { t } = useTranslation('kiosk');
  const displayName = row.displayName ?? t('leaderboard.anonymous');
  const isTopRank = rank <= TOP_RANKS;

  return (
    <li className={isTopRank ? `${styles.row} ${styles.topRow}` : styles.row}>
      <span className={styles.rank}>{rank}</span>
      {row.avatarUrl !== null ? (
        <img className={styles.avatar} src={row.avatarUrl} alt="" />
      ) : (
        <span className={styles.avatarFallback} aria-hidden="true">
          {displayName.charAt(0).toUpperCase()}
        </span>
      )}
      <span className={styles.name}>{displayName}</span>
      <span className={styles.sends}>
        <span className={styles.sendCount}>{row.sendCount}</span>
        <span className={styles.sendLabel}>
          {t('leaderboard.sends', { count: row.sendCount })}
          {row.hardestGradeName !== null ? ` · ${row.hardestGradeName}` : null}
        </span>
      </span>
    </li>
  );
}
