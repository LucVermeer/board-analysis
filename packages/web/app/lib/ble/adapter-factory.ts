import type { BoardName } from '@/app/lib/types';
import {
  isCapacitor,
  isCapacitorWebView,
  waitForCapacitor,
  CAPACITOR_BRIDGE_TIMEOUT_MS,
  supportsNativeIosBoardBle,
} from './capacitor-utils';
import type { BluetoothAdapter, DevicePickerFn } from './types';

// Cache the detected adapter class after the first call so subsequent
// connection attempts skip platform detection and bridge polling entirely.
type AdapterFactory = (boardName: BoardName, devicePicker?: DevicePickerFn) => Promise<BluetoothAdapter>;
let cachedFactory: AdapterFactory | null = null;

/** @internal Reset cached factory — only for tests */
export function _resetFactoryCache(): void {
  cachedFactory = null;
}

export async function createBluetoothAdapter(
  boardName: BoardName,
  devicePicker?: DevicePickerFn,
): Promise<BluetoothAdapter> {
  if (cachedFactory) {
    return cachedFactory(boardName, devicePicker);
  }

  // If we detect a WebView but the Capacitor bridge isn't ready yet, wait briefly
  if (!isCapacitor() && isCapacitorWebView()) {
    await waitForCapacitor(CAPACITOR_BRIDGE_TIMEOUT_MS);
  }

  if (isCapacitor()) {
    cachedFactory = async (nextBoardName, nextPicker) => {
      if (nextBoardName !== 'moonboard' && supportsNativeIosBoardBle()) {
        const { NativeIosBleAdapter } = await import('./native-ios-adapter');
        return new NativeIosBleAdapter(nextPicker);
      }

      const { CapacitorBleAdapter } = await import('./capacitor-adapter');
      return new CapacitorBleAdapter(nextBoardName, nextPicker);
    };
    return cachedFactory(boardName, devicePicker);
  }

  const { WebBluetoothAdapter } = await import('./web-adapter');
  cachedFactory = async (nextBoardName) => new WebBluetoothAdapter(nextBoardName);
  return new WebBluetoothAdapter(boardName);
}
