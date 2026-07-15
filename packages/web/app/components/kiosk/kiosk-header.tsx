'use client';

// Slim 64px brand bar: gym logo + name on the left, kiosk name + a
// "Reconnecting…" chip on the right. Client component because the chip reads
// the shared ws client's connection status from the presence hub.

import React from 'react';
import { useTranslation } from 'react-i18next';
import LocaleLink from '@/app/components/i18n/locale-link';
import { useKioskConnectionStatus } from './presence/use-kiosk-board-presence';
import styles from './kiosk-header.module.css';

export default function KioskHeader({
  gymName,
  logoUrl,
  kioskName,
  gymSlug = null,
}: {
  gymName: string;
  logoUrl: string | null;
  kioskName: string;
  /** When set, the brand block links to the public gym page. The kiosk page is
   * noindex,follow, so this server-rendered anchor is what lets crawlers reach
   * the gym page (gym pages aren't in the sitemap yet). LocaleLink keeps the
   * active locale, so /es/kiosk/... links to /es/gym/... Visually inert on a TV. */
  gymSlug?: string | null;
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
      {gymSlug ? (
        <LocaleLink className={`${styles.brand} ${styles.brandLink}`} href={`/gym/${gymSlug}`} prefetch={false}>
          {brandContent}
        </LocaleLink>
      ) : (
        <div className={styles.brand}>{brandContent}</div>
      )}
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
