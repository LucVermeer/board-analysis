// Scoped kiosk theming. Server-safe: resolves the gym's brand accent (clamped
// for contrast) into CSS custom properties on a wrapper element, so every
// kiosk component styles itself with `var(--kiosk-*)` and never touches the
// gym's raw hex. The kiosk surface is ALWAYS dark — branding contributes the
// accent only (see lib/kiosk/brand-contrast.ts).

import React, { type CSSProperties, type ReactNode } from 'react';
import type { Gym } from '@boardsesh/shared-schema';
import { resolveKioskBrand } from '@/app/lib/kiosk/brand-contrast';
import styles from './kiosk-theme-scope.module.css';

export default function KioskThemeScope({
  gym,
  children,
}: {
  gym: Pick<Gym, 'brandAccentColor' | 'brandPrimaryColor'>;
  children: ReactNode;
}) {
  const brand = resolveKioskBrand(gym);
  const brandVariables = {
    '--kiosk-accent': brand.accent,
    '--kiosk-on-accent': brand.onAccent,
  } as CSSProperties;

  return (
    <div className={styles.scope} style={brandVariables}>
      {children}
    </div>
  );
}
