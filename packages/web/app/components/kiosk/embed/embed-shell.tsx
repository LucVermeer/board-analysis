// EmbedShell — the common frame for /embed/** widgets: the always-dark kiosk
// theme scope (branded only by a PUBLIC gym; see resolveEmbedBrandGym) around
// a fixed-height single-cell content area, closed by the non-removable
// "Powered by Boardsesh" footer bar. Server-safe; the widget content decides
// what (if anything) goes live client-side.
//
// Review rule for everything under app/embed/**: display-only, cookieless, no
// authenticated action and no auth-dependent UI — these pages are framed by
// third-party sites (frame-ancestors *), so nothing on them may depend on or
// solicit Boardsesh credentials.

import React, { type ReactNode } from 'react';
import type { Gym } from '@boardsesh/shared-schema';
import KioskThemeScope from '../kiosk-theme-scope';
import KioskAttribution from '../kiosk-attribution';
import styles from './embed-shell.module.css';

const UNBRANDED_EMBED_THEME: Pick<Gym, 'brandAccentColor' | 'brandPrimaryColor'> = {
  brandAccentColor: null,
  brandPrimaryColor: null,
};

export default function EmbedShell({
  brandGym,
  attributionHref,
  children,
}: {
  /** The PUBLIC gym whose branding applies, or null for the default-dark shell. */
  brandGym: Pick<Gym, 'brandAccentColor' | 'brandPrimaryColor'> | null;
  attributionHref: string;
  children: ReactNode;
}) {
  return (
    <KioskThemeScope gym={brandGym ?? UNBRANDED_EMBED_THEME}>
      <div className={styles.shell}>
        <div className={styles.content}>{children}</div>
        <KioskAttribution variant="embed" href={attributionHref} />
      </div>
    </KioskThemeScope>
  );
}
