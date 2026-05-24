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

    return allGranted;
  }, []);

  return {
    bleState,
    isAvailable: bleState === State.PoweredOn,
    requestPermissions,
  };
}
