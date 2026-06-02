import { type Device, type Characteristic, State } from 'react-native-ble-plx';
import {
  AURORA_ADVERTISED_SERVICE_UUID,
  UART_SERVICE_UUID,
  UART_WRITE_CHARACTERISTIC_UUID,
  splitMessages,
  INTER_CHUNK_DELAY_MS,
  parseSerialNumber,
} from '@boardsesh/ble-protocol';
import { bleManager } from './ble-manager';
import type { BluetoothAdapter, BleConnection, DevicePickerFn, DiscoveredDevice } from './types';
import { SCAN_TIMEOUT_MS, SERIAL_RECONNECT_GRACE_MS } from './scan-constants';

const CONNECTION_TIMEOUT_MS = 12_000;

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class RNBleAdapter implements BluetoothAdapter {
  private connectedDevice: Device | null = null;
  private writeCharacteristic: Characteristic | null = null;
  private disconnectCallback: (() => void) | null = null;
  private disconnectSubscription: { remove: () => void } | null = null;

  constructor(private readonly devicePicker: DevicePickerFn) {}

  async isAvailable(): Promise<boolean> {
    try {
      const state = await bleManager.state();
      return state === State.PoweredOn;
    } catch {
      return false;
    }
  }

  async requestAndConnect(targetSerial?: string): Promise<BleConnection> {
    const devices = new Map<string, DiscoveredDevice>();
    let updateListener: ((devices: DiscoveredDevice[]) => void) | null = null;
    const pushDevices = () => updateListener?.([...devices.values()]);

    // One selection promise, resolved by either the silent serial auto-select
    // or — if that serial never shows up — the picker the grace window opens.
    let resolveSelection!: (deviceId: string) => void;
    let rejectSelection!: (error: Error) => void;
    const selectionPromise = new Promise<string>((resolve, reject) => {
      resolveSelection = resolve;
      rejectSelection = reject;
    });

    // True only while we're still silently matching the target serial — flips
    // false the moment we auto-select or hand off to the picker.
    let autoSelecting = Boolean(targetSerial);
    let pickerOpened = false;
    const openPicker = () => {
      if (pickerOpened) return;
      pickerOpened = true;
      autoSelecting = false;
      this.devicePicker((onUpdate) => {
        updateListener = onUpdate;
        pushDevices();
      }).then(resolveSelection, rejectSelection);
    };

    // No target serial → straight to the picker.
    if (!targetSerial) {
      openPicker();
    }

    bleManager.startDeviceScan(
      [AURORA_ADVERTISED_SERVICE_UUID, UART_SERVICE_UUID],
      null,
      (scanError, scannedDevice) => {
        if (scanError) {
          bleManager.stopDeviceScan();
          // Surface the failure immediately so the user sees feedback instead of
          // waiting out the 30s scan window (the picker, if open, closes too).
          rejectSelection(new Error(`BLE scan failed: ${scanError.message}`));
          return;
        }

        if (!scannedDevice) return;

        const device: DiscoveredDevice = {
          deviceId: scannedDevice.id,
          name: scannedDevice.localName ?? scannedDevice.name ?? undefined,
          rssi: scannedDevice.rssi ?? -100,
        };

        // Deduplicate by deviceId — react-native-ble-plx uses stable
        // peripheral UUIDs on iOS and device addresses on Android.
        devices.set(device.deviceId, device);
        pushDevices();

        // Auto-select the stored board only until the picker takes over.
        if (autoSelecting && targetSerial) {
          const serial = parseSerialNumber(device.name);
          if (serial === targetSerial) {
            autoSelecting = false;
            resolveSelection(device.deviceId);
          }
        }
      },
    );

    // Grace window: if the stored serial hasn't matched shortly, open the picker
    // (scan keeps running so it live-updates) instead of waiting out the full
    // scan window and failing. Matches the web reconnect-by-serial fallback.
    const pickerFallbackId = targetSerial
      ? setTimeout(() => {
          if (autoSelecting) openPicker();
        }, SERIAL_RECONNECT_GRACE_MS)
      : undefined;

    const scanTimeoutId = setTimeout(() => {
      bleManager.stopDeviceScan();
      // Belt-and-suspenders: make sure the picker is open even if the grace
      // window never fired.
      if (autoSelecting) openPicker();
      // The picker is showing but nothing ever advertised — surface the empty
      // result so the sheet doesn't spin forever.
      if (pickerOpened && devices.size === 0) {
        rejectSelection(new Error('No boards found within scan window'));
      }
    }, SCAN_TIMEOUT_MS);

    let selectedDeviceId: string;
    try {
      selectedDeviceId = await selectionPromise;
    } finally {
      if (pickerFallbackId) clearTimeout(pickerFallbackId);
      clearTimeout(scanTimeoutId);
      bleManager.stopDeviceScan();
    }

    let selectedDeviceName: string | undefined;
    for (const device of devices.values()) {
      if (device.deviceId === selectedDeviceId) {
        selectedDeviceName = device.name;
        break;
      }
    }

    let connectionTimeoutId: ReturnType<typeof setTimeout> | null = null;
    const connected = await Promise.race([
      bleManager.connectToDevice(selectedDeviceId),
      new Promise<never>((_resolve, reject) => {
        connectionTimeoutId = setTimeout(() => {
          bleManager.cancelDeviceConnection(selectedDeviceId).catch(() => {});
          reject(new Error('Connection timed out — board may be powered off'));
        }, CONNECTION_TIMEOUT_MS);
      }),
    ]).finally(() => {
      if (connectionTimeoutId != null) clearTimeout(connectionTimeoutId);
    });

    // Negotiate MTU before service discovery (Android requires this order
    // for best results; iOS handles MTU automatically but the call is safe).
    try {
      await connected.requestMTU(512);
    } catch {
      // Fall back to default MTU (23 bytes, 20 usable) — splitMessages handles chunking.
    }

    const deviceWithServices = await connected.discoverAllServicesAndCharacteristics();

    const characteristics = await deviceWithServices.characteristicsForService(UART_SERVICE_UUID);
    const uartWrite = characteristics.find(
      (characteristic) => characteristic.uuid.toLowerCase() === UART_WRITE_CHARACTERISTIC_UUID.toLowerCase(),
    );

    if (!uartWrite) {
      await bleManager.cancelDeviceConnection(selectedDeviceId);
      throw new Error('UART write characteristic not found');
    }

    this.connectedDevice = deviceWithServices;
    this.writeCharacteristic = uartWrite;

    this.disconnectSubscription = bleManager.onDeviceDisconnected(selectedDeviceId, (_error, _device) => {
      this.connectedDevice = null;
      this.writeCharacteristic = null;
      this.disconnectSubscription?.remove();
      this.disconnectSubscription = null;
      this.disconnectCallback?.();
    });

    return {
      deviceId: selectedDeviceId,
      deviceName: selectedDeviceName,
    };
  }

  async disconnect(): Promise<void> {
    if (this.disconnectSubscription) {
      this.disconnectSubscription.remove();
      this.disconnectSubscription = null;
    }

    if (this.connectedDevice) {
      const deviceId = this.connectedDevice.id;
      this.connectedDevice = null;
      this.writeCharacteristic = null;
      try {
        await bleManager.cancelDeviceConnection(deviceId);
      } catch {
        // Device may already be disconnected
      }
    }
  }

  async write(data: Uint8Array, signal?: AbortSignal): Promise<void> {
    if (!this.writeCharacteristic) {
      throw new Error('Not connected');
    }

    const chunks = splitMessages(data);

    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
      if (signal?.aborted) {
        throw new DOMException('Write aborted', 'AbortError');
      }

      // Re-check the characteristic before each chunk — a mid-write
      // disconnect sets it to null via the onDeviceDisconnected handler.
      const characteristic = this.writeCharacteristic;
      if (!characteristic) {
        throw new Error('Device disconnected during write');
      }

      if (chunkIndex > 0) {
        await delay(INTER_CHUNK_DELAY_MS);
      }

      const chunk = chunks[chunkIndex];
      const base64Chunk = uint8ArrayToBase64(chunk);

      await characteristic.writeWithoutResponse(base64Chunk);
    }
  }

  onDisconnect(callback: () => void): () => void {
    this.disconnectCallback = callback;
    return () => {
      this.disconnectCallback = null;
    };
  }
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let byteIndex = 0; byteIndex < bytes.length; byteIndex++) {
    binary += String.fromCharCode(bytes[byteIndex]);
  }
  return btoa(binary);
}
