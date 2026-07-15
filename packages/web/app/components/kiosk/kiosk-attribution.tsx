'use client';

// Non-removable "Powered by Boardsesh" mark, fixed bottom-right. The brand
// name stays untranslated (trademark convention); only the "Powered by"
// prefix localizes.

import React from 'react';
import { useTranslation } from 'react-i18next';
import styles from './kiosk-attribution.module.css';

const BRAND_NAME = 'Boardsesh';

export default function KioskAttribution() {
  const { t } = useTranslation('kiosk');
  return (
    <a className={styles.attribution} href="https://boardsesh.com" target="_blank" rel="noopener noreferrer">
      {t('attribution.poweredBy')} <span className={styles.brand}>{BRAND_NAME}</span>
    </a>
  );
}
