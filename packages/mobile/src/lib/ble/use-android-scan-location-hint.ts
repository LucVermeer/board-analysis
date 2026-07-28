// Drives the "Android is hiding the scan results until Location is allowed"
// empty-state hint. See android-scan-location-gate.ts for why the hint exists
// and how it retires itself.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as Application from 'expo-application';
import {
  androidApiLevel,
  getAndroidLocationPermissionState,
  requestAndroidScanLocationPermission,
} from './android-location-permission';
import { androidBuildHidesScanResultsWithoutLocation } from './android-scan-location-gate';

export type AndroidScanLocationHint = {
  /**
   * True when an empty scan on this binary is plausibly Android suppressing
   * results, and granting location is a real remedy. Consumers should swap their
   * generic hardware troubleshooting copy for the location copy + grant button.
   */
  shouldOfferLocationGrant: boolean;
  /** True once the user granted location from the hint — prompt them to rescan. */
  wasGranted: boolean;
  /** True while the system dialog is up. */
  isRequesting: boolean;
  /** Fires the system prompt; resolves to whether it was granted. */
  requestLocationPermission: () => Promise<boolean>;
};

/**
 * @param active Whether a zero-result state is currently on screen. The
 *   permission read is deferred until then so nothing runs on every scan tick.
 */
export function useAndroidScanLocationHint(active: boolean): AndroidScanLocationHint {
  const [locationGranted, setLocationGranted] = useState<boolean | null>(null);
  const [isRequesting, setIsRequesting] = useState(false);
  const [wasGranted, setWasGranted] = useState(false);
  // A late `check` resolution must not overwrite state after the sheet closed
  // (or after the user granted from the button).
  const activeReadRef = useRef(0);

  const buildHidesResults = androidBuildHidesScanResultsWithoutLocation({
    platformOs: Platform.OS,
    androidApiLevel: androidApiLevel(),
    nativeBuildVersion: Application.nativeBuildVersion,
  });

  useEffect(() => {
    if (!active || !buildHidesResults) {
      setLocationGranted(null);
      setWasGranted(false);
      activeReadRef.current += 1;
      return;
    }

    const readId = activeReadRef.current + 1;
    activeReadRef.current = readId;
    void getAndroidLocationPermissionState().then((granted) => {
      if (activeReadRef.current !== readId) return;
      setLocationGranted(granted);
    });
  }, [active, buildHidesResults]);

  const requestLocationPermission = useCallback(async () => {
    setIsRequesting(true);
    try {
      const granted = await requestAndroidScanLocationPermission();
      setLocationGranted(granted);
      setWasGranted(granted);
      return granted;
    } finally {
      setIsRequesting(false);
    }
  }, []);

  return {
    shouldOfferLocationGrant: buildHidesResults && active && locationGranted === false,
    wasGranted,
    isRequesting,
    requestLocationPermission,
  };
}
