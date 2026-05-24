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

const SCAN_TIMEOUT_MS = 30_000;

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

    let autoSelectResolve: ((deviceId: string) => void) | null = null;
    let autoSelectReject: ((error: Error) => void) | null = null;

    let selectionPromise: Promise<string>;
    if (targetSerial) {
      selectionPromise = new Promise<string>((resolve, reject) => {
        autoSelectResolve = resolve;
        autoSelectReject = reject;
      });
    } else {
      selectionPromise = this.devicePicker((onUpdate) => {
        updateListener = onUpdate;
        pushDevices();
      });
    }

    bleManager.startDeviceScan([AURORA_ADVERTISED_SERVICE_UUID, UART_SERVICE_UUID], null, (_error, scannedDevice) => {
      if (_error || !scannedDevice) return;

      const device: DiscoveredDevice = {
        deviceId: scannedDevice.id,
        name: scannedDevice.localName ?? scannedDevice.name ?? undefined,
        rssi: scannedDevice.rssi ?? -100,
      };

      // Deduplicate by deviceId — react-native-ble-plx uses stable
      // peripheral UUIDs on iOS and device addresses on Android.
      devices.set(device.deviceId, device);
      pushDevices();

      if (autoSelectResolve && targetSerial) {
        const serial = parseSerialNumber(device.name);
        if (serial === targetSerial) {
          autoSelectResolve(device.deviceId);
          autoSelectResolve = null;
        }
      }
    });

    const scanTimeoutId = setTimeout(() => {
      bleManager.stopDeviceScan();
      if (autoSelectReject) {
        autoSelectReject(new Error('Target board not found during scan'));
        autoSelectReject = null;
      }
    }, SCAN_TIMEOUT_MS);

    let selectedDeviceId: string;
    try {
      selectedDeviceId = await selectionPromise;
    } finally {
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

    const connected = await bleManager.connectToDevice(selectedDeviceId);

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

      if (chunkIndex > 0) {
        await delay(INTER_CHUNK_DELAY_MS);
      }

      const chunk = chunks[chunkIndex];
      const base64Chunk = uint8ArrayToBase64(chunk);

      await this.writeCharacteristic.writeWithoutResponse(base64Chunk);
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
