import { BleManager } from 'react-native-ble-plx';

export const bleManager = new BleManager({
  restoreStateIdentifier: 'boardsesh-ble-restore',
  restoreStateFunction: (_restoredState) => {
    // iOS calls this on launch when CoreBluetooth restores a previously
    // connected peripheral. The app-level reconnect logic in
    // BluetoothProvider handles re-establishing the connection via
    // AppState foreground detection, so no action needed here beyond
    // allowing the BleManager to initialize with restoration support.
  },
});
