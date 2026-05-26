import { Platform } from 'react-native';
import { boardBleNative } from '../../../modules/live-activity/src/index';
import { RNBleAdapter } from './adapter';
import { NativeIosBleAdapter } from './native-ios-adapter';
import type { BluetoothAdapter, DevicePickerFn } from './types';

// Returns the BluetoothAdapter implementation appropriate for the current
// platform. iOS uses the native Swift BoardBleManager (so widget Live
// Activity intents can drive the wall synchronously); Android continues to
// use react-native-ble-plx via RNBleAdapter.
//
// Falls back to RNBleAdapter on iOS only if the native module wasn't linked
// into the running binary — covers Expo Go and any preview build older than
// the one that bundled the live-activity module. Production preview builds
// always take the native path.
export function createBluetoothAdapter(devicePicker: DevicePickerFn): BluetoothAdapter {
  if (Platform.OS === 'ios' && boardBleNative) {
    return new NativeIosBleAdapter(devicePicker);
  }
  return new RNBleAdapter(devicePicker);
}

// `true` iff the runtime adapter is the native iOS one — used by the
// provider to decide whether to push board configuration into native shared
// state for the widget intent path.
export function isNativeIosBleAdapter(adapter: BluetoothAdapter): adapter is NativeIosBleAdapter {
  return adapter instanceof NativeIosBleAdapter;
}
