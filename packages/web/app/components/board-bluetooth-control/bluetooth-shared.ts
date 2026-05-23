// Re-export pure transport constants/helpers from the shared BLE protocol package.
export {
  MAX_BLUETOOTH_MESSAGE_SIZE,
  MESSAGE_BODY_MAX_LENGTH,
  AURORA_ADVERTISED_SERVICE_UUID,
  UART_SERVICE_UUID,
  UART_WRITE_CHARACTERISTIC_UUID,
  splitMessages,
} from '@boardsesh/ble-protocol/transport';

import { UART_SERVICE_UUID, UART_WRITE_CHARACTERISTIC_UUID } from '@boardsesh/ble-protocol/transport';

// Small delay between write-without-response chunks to avoid overwhelming the BLE stack.
// Matches the pacing strategy used in the Capacitor adapter.
const INTER_CHUNK_DELAY_MS = 5;
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// --- Web-specific BLE helpers (use Web Bluetooth DOM types) ---

export const writeCharacteristicSeries = async (
  characteristic: BluetoothRemoteGATTCharacteristic,
  messages: Uint8Array[],
  signal?: AbortSignal,
) => {
  for (let i = 0; i < messages.length; i++) {
    if (signal?.aborted) {
      throw new DOMException('Write aborted', 'AbortError');
    }
    if (i > 0) {
      await delay(INTER_CHUNK_DELAY_MS);
    }
    await characteristic.writeValueWithoutResponse(new Uint8Array(messages[i]));
  }
};

export const requestBluetoothDevice = async (options: RequestDeviceOptions) =>
  navigator.bluetooth.requestDevice(options);

export const getUartCharacteristic = async (device: BluetoothDevice) => {
  const server = await device.gatt?.connect();
  const service = await server?.getPrimaryService(UART_SERVICE_UUID);
  return await service?.getCharacteristic(UART_WRITE_CHARACTERISTIC_UUID);
};
