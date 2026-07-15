'use client';

// Stamps a `kiosk: true` PostHog super property on kiosk routes, so events
// from 24/7 gym TVs are distinguishable from real climbers in every funnel.

import { useEffect } from 'react';
import { registerSuperProperties } from '@/app/lib/analytics';

export default function KioskAnalytics() {
  useEffect(() => {
    registerSuperProperties({ kiosk: true });
  }, []);
  return null;
}
