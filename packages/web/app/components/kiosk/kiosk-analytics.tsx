'use client';

// Stamps a `kiosk: true` PostHog super property on kiosk routes, so events
// from 24/7 gym TVs are distinguishable from real climbers in every funnel.
// Session-scoped on purpose: a persistent super property would permanently
// mark a gym owner who previews the kiosk in their everyday browser. The TV
// re-registers on every load (and reloads daily), so nothing is lost.

import { useEffect } from 'react';
import { registerSessionSuperProperties } from '@/app/lib/analytics';

export default function KioskAnalytics() {
  useEffect(() => {
    registerSessionSuperProperties({ kiosk: true });
  }, []);
  return null;
}
