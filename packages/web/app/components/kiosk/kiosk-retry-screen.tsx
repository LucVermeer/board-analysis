'use client';

// Shown when the kiosk config fetch FAILED (backend blip, network outage) —
// as opposed to a successful "no such kiosk" response, which 404s. A TV is
// unattended, so this screen must recover on its own: it re-runs the server
// render via router.refresh() on an exponential backoff (30s → 5 min cap).
//
// router.refresh() rather than location.reload(): a refresh that still fails
// re-renders this same component in place, so React preserves the attempt
// counter and the backoff actually grows; a full reload would reset it to the
// base delay every time. The moment a refresh succeeds, the real kiosk tree
// replaces this screen.

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import styles from './kiosk-retry-screen.module.css';

const BASE_RETRY_DELAY_MS = 30 * 1000;
const MAX_RETRY_DELAY_MS = 5 * 60 * 1000;

export function retryDelayMs(attempt: number): number {
  return Math.min(BASE_RETRY_DELAY_MS * 2 ** attempt, MAX_RETRY_DELAY_MS);
}

export default function KioskRetryScreen() {
  const { t } = useTranslation('kiosk');
  const router = useRouter();
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setAttempt((previousAttempt) => previousAttempt + 1);
      router.refresh();
    }, retryDelayMs(attempt));
    return () => clearTimeout(timeoutId);
  }, [attempt, router]);

  return (
    <div className={styles.screen}>
      <h1 className={styles.title}>{t('retry.title')}</h1>
      <p className={styles.body}>{t('retry.body')}</p>
      <span className={styles.pulse} aria-hidden="true" />
    </div>
  );
}
