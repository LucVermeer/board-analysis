'use client';

// Per-board "install Boardsesh" QR for the kiosk. Encodes /b/{slug} for THIS
// board so a climber on the wall can scan, get the app, and have their sends
// light up the screen. Rendered in a corner of the board slot when the kiosk's
// showInstallQr toggle is on and the board has a slug.
//
// The QR must sit on a WHITE tile: a bare dark QR on the dark kiosk surface
// won't scan (a QR needs a light quiet zone), so we render black modules on a
// white card and keep the caption dark-on-white too.
//
// TARGET NOTE: /b/{slug} opens the WEB board page (which carries install CTAs)
// everywhere, and is iOS-universal-link eligible. It does NOT yet open the
// mobile app straight to the board — that needs a native mobile app/b/[slug]
// route + an Android /b autoVerify intent filter (see the tracked follow-up
// issue). The web board page is the current fallback.

import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useTranslation } from 'react-i18next';
import { absoluteUrl } from '@/app/lib/seo/base-url';
import styles from './board-install-qr.module.css';

export default function BoardInstallQr({ slug }: { slug: string }) {
  const { t } = useTranslation('kiosk');
  const installUrl = absoluteUrl(`/b/${slug}`);

  return (
    <div className={styles.tile}>
      {/* Fixed internal resolution; CSS scales the SVG responsively via clamp(). */}
      <QRCodeSVG className={styles.qr} value={installUrl} size={128} level="M" marginSize={1} aria-hidden />
      <span className={styles.caption}>{t('installQr.caption')}</span>
    </div>
  );
}
