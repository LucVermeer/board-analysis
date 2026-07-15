// Preset grid for the kiosk body. Pure layout, server-rendered.
//
// Landscape (the 16:9 default):
//   single → 1 row / 1 col      dual → 1 row / 2 cols
//   triple → 1 row / 3 cols     quad → 2 rows / 2 cols
// The optional rail adds a clamp(300px, 24vw, 440px) right column.
// Portrait TVs stack the presets into rows and drop the rail to a bottom band.
// Plain media queries + clamp() only — NO container queries (old TV browsers).

import React, { type ReactNode } from 'react';
import type { KioskPreset } from '@boardsesh/kiosk';
import styles from './kiosk-layout.module.css';

const PRESET_CLASS: Record<KioskPreset, string> = {
  single: styles.single,
  dual: styles.dual,
  triple: styles.triple,
  quad: styles.quad,
};

export default function KioskLayout({
  preset,
  rail,
  children,
}: {
  preset: KioskPreset;
  /** The leaderboard rail, or null/undefined when the rail is off. */
  rail?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={rail ? `${styles.body} ${styles.bodyWithRail}` : styles.body}>
      <div className={`${styles.boardArea} ${PRESET_CLASS[preset]}`}>{children}</div>
      {rail ? <aside className={styles.rail}>{rail}</aside> : null}
    </div>
  );
}
