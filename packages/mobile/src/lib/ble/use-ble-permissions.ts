import { useCallback, useEffect, useState } from 'react';
import { Platform, PermissionsAndroid } from 'react-native';
import { State } from 'react-native-ble-plx';
import { bleManager } from './ble-manager';

type BlePermissionsResult = {
  bleState: State;
  isAvailable: boolean;
  requestPermissions: () => Promise<boolean>;
};

export function useBlePermissions(): BlePermissionsResult {
  const [bleState, setBleState] = useState<State>(State.Unknown);

  useEffect(() => {
    const subscription = bleManager.onStateChange((newState) => {
      setBleState(newState);
    }, true);

    return () => subscription.remove();
  }, []);

  const requestPermissions = useCallback(async (): Promise<boolean> => {
    if (Platform.OS === 'ios') {
      // iOS handles BLE permissions via Info.plist entries; the system prompts
      // automatically on first scan. No runtime permission request needed.
      const state = await bleManager.state();
      return state === State.PoweredOn;
    }

    // Android: request runtime BLE permissions
    const permissions: Array<(typeof PermissionsAndroid.PERMISSIONS)[keyof typeof PermissionsAndroid.PERMISSIONS]> = [];

    if (typeof Platform.Version === 'number' && Platform.Version >= 31) {
      permissions.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN, PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);
    } else {
      permissions.push(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    }

    const results = await PermissionsAndroid.requestMultiple(permissions);
    const allGranted = Object.values(results).every((result) => result === PermissionsAndroid.RESULTS.GRANTED);

    // POST_NOTIFICATIONS (Android 13+) lets the session foreground-service show
    // its ongoing notification with Previous/Next controls. Requested here — at
    // connect time, the contextual moment a session becomes possible — but kept
    // DECOUPLED from the BLE gate: a denial only hides the notification; the
    // foreground service still runs and keeps the board connection alive in the
    // background, so it must never block connecting.
    if (typeof Platform.Version === 'number' && Platform.Version >= 33) {
      try {
        await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
      } catch {
        // Notification permission is optional for BLE continuity — ignore failures.
      }
    }

    return allGranted;
  }, []);

  return {
    bleState,
    isAvailable: bleState === State.PoweredOn,
    requestPermissions,
  };
}
