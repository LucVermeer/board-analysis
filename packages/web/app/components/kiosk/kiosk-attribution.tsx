'use client';

// Non-removable "Powered by Boardsesh" mark. The brand name stays untranslated
// (trademark convention); only the "Powered by" prefix localizes.
//
// Variants:
//  - 'overlay' (kiosk TVs): floating pill fixed bottom-right over the layout;
//    `hasRail` shifts it clear of the leaderboard rail.
//  - 'embed' (iframe widgets): slim full-width in-flow footer bar, so the
//    attribution is part of the widget's fixed height and can't be cropped by
//    the host page's iframe sizing.

import React from 'react';
import { useTranslation } from 'react-i18next';
import styles from './kiosk-attribution.module.css';

const BRAND_NAME = 'Boardsesh';

export default function KioskAttribution({
  variant = 'overlay',
  hasRail = false,
  href = 'https://boardsesh.com',
}: {
  variant?: 'overlay' | 'embed';
  /** Overlay variant only: offset the mark clear of the leaderboard rail. */
  hasRail?: boolean;
  /** Attribution link target — embeds point at the gym's public Boardsesh page when it has one. */
  href?: string;
}) {
  const { t } = useTranslation('kiosk');
  const overlayClassName = hasRail ? `${styles.attribution} ${styles.withRail}` : styles.attribution;
  return (
    <a
      className={variant === 'embed' ? styles.embedBar : overlayClassName}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
    >
      {t('attribution.poweredBy')} <span className={styles.brand}>{BRAND_NAME}</span>
    </a>
  );
}
