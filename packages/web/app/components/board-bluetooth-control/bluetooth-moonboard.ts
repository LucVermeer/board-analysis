// Re-export all protocol logic from the shared BLE protocol package.
export {
  isMoonboardDeviceName,
  getMoonboardSerialPosition,
  getMoonboardBluetoothPacket,
} from '@boardsesh/ble-protocol/moonboard';

import { UART_SERVICE_UUID } from '@boardsesh/ble-protocol/transport';

// --- Web-specific constants (use Web Bluetooth DOM types) ---

const MOONBOARD_DEVICE_NAME_PREFIXES = ['MoonBoard', 'Moonboard'] as const;

export const MOONBOARD_SCAN_SERVICE_UUIDS = [UART_SERVICE_UUID] as const;
export const MOONBOARD_OPTIONAL_SERVICE_UUIDS = [UART_SERVICE_UUID] as const;

export const MOONBOARD_REQUEST_DEVICE_OPTIONS: RequestDeviceOptions = {
  filters: [
    { services: [...MOONBOARD_SCAN_SERVICE_UUIDS] },
    ...MOONBOARD_DEVICE_NAME_PREFIXES.map((namePrefix) => ({ namePrefix })),
  ],
  optionalServices: [...MOONBOARD_OPTIONAL_SERVICE_UUIDS],
};
