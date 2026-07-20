import type { ScanOptions } from 'react-native-ble-plx';

/**
 * ble-plx scan options for the foreground "find my board" scans — the device
 * picker (`adapter.ts`) and the Bluetooth quickstart (`use-board-scan.ts`).
 * High-power on purpose: locating the user's board quickly matters more than the
 * radio cost of a short, user-initiated foreground scan.
 *
 * - `scanMode: LowLatency` (Android only) runs a ~100% scan duty cycle instead of
 *   ble-plx's default LowPower (~10%). The Expo 57 / React Native 0.86 upgrade
 *   degraded Android BLE discovery and roughly doubled the empty-picker rate;
 *   LowLatency is the community mitigation for "Android scan misses devices".
 * - `allowDuplicates` (iOS only) reports each advertisement repeatedly, so a name
 *   or service UUID that arrives in a later ADV / scan-response packet still
 *   reaches the JS filter instead of being dropped after a nameless first report.
 *
 * `scanMode` is typed as the ScanMode enum, where `2 === ScanMode.LowLatency`. We
 * use the numeric literal (cast to the field's type) so this module stays a
 * type-only import of react-native-ble-plx and never pulls the native package
 * into the web bundle — the web build only type-imports ble-plx today.
 */
export const HIGH_POWER_BOARD_SCAN_OPTIONS: ScanOptions = {
  scanMode: 2 as ScanOptions['scanMode'], // ScanMode.LowLatency (Android)
  allowDuplicates: true, // iOS
};
