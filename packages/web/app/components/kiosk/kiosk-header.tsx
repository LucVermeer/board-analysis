'use client';

// Slim 64px brand bar: gym logo + name on the left, kiosk name + a
// "Reconnecting…" chip on the right. Client component because the chip reads
// the shared ws client's connection status from the presence hub.

import React from 'react';
import { useTranslation } from 'react-i18next';
import { useKioskConnectionStatus } from './presence/use-kiosk-board-presence';
import styles from './kiosk-header.module.css';

export default function KioskHeader({
  gymName,
  logoUrl,
  kioskName,
}: {
  gymName: string;
  logoUrl: string | null;
  kioskName: string;
}) {
  const { t } = useTranslation('kiosk');
  const connectionStatus = useKioskConnectionStatus();

  // With a logo, the wordmark text is redundant — show the logo alone and let it
  // carry the gym name via `alt`, which also gives the brand block its accessible
  // name. Without a logo, fall back to the gym name as text.
  const brandContent = logoUrl ? (
    <img className={styles.logo} src={logoUrl} alt={gymName} />
  ) : (
    <span className={styles.gymName}>{gymName}</span>
  );

  return (
    <header className={styles.header}>
      <div className={styles.brand}>{brandContent}</div>
      <div className={styles.meta}>
        {connectionStatus === 'reconnecting' ? (
          <span className={styles.reconnectChip} role="status">
            {t('header.reconnecting')}
          </span>
        ) : null}
        <span className={styles.kioskName}>{kioskName}</span>
      </div>
    </header>
  );
}
