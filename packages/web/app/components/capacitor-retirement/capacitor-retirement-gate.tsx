'use client';

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { getPlatform, isCapacitorWebView, isNativeApp, waitForCapacitor } from '@/app/lib/ble/capacitor-utils';
import { track } from '@/app/lib/analytics';

// Only the retired app ever needs this, so keep it out of everyone else's
// initial payload.
const CapacitorRetirementScreen = dynamic(() => import('./capacitor-retirement-screen'), { ssr: false });

/**
 * Replaces the entire app with a dead-end update screen when it is running
 * inside the retired Capacitor app.
 *
 * That app was a WebView on boardsesh.com, so it keeps loading the live site
 * long after its source was deleted (PR #3175). PostHog puts the remaining
 * installs at a couple of people a day, all of whom are better served by the
 * React Native rewrite, so the old shell stops here: no dismiss, no snooze, no
 * flag. Swapping out `children` rather than painting over them means the live
 * app — BLE, the party-session socket, board presence — is torn down too,
 * instead of running invisibly behind a blocking screen.
 *
 * `window.Capacitor` exists only inside that WebView (the RN app never renders
 * the web UI and browsers never inject it), so this can't reach anyone else.
 * The UA heuristic below only ever buys time for the bridge to appear — the
 * takeover still waits for the real `window.Capacitor` before it shows.
 */
export const CapacitorRetirementGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [retired, setRetired] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const retire = () => {
      if (cancelled) return;
      setRetired(true);
      track('Capacitor Retirement Screen Shown', { platform: getPlatform() });
    };

    if (isNativeApp()) {
      retire();
      return;
    }

    // The bridge injects window.Capacitor slightly after app JS runs, so a
    // straight isNativeApp() check races it and can wave a straggler through.
    // Same wait home-page-content.tsx uses before classifying someone as web.
    if (isCapacitorWebView()) {
      void waitForCapacitor()
        .then((appeared) => {
          if (appeared && isNativeApp()) retire();
        })
        .catch(() => {
          // Bridge never showed up — treat as a browser and leave the app alone.
        });
    }

    return () => {
      cancelled = true;
    };
  }, []);

  if (retired) return <CapacitorRetirementScreen />;
  return <>{children}</>;
};

export default CapacitorRetirementGate;
