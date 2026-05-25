import {
  AURORA_ADVERTISED_SERVICE_UUID,
  UART_SERVICE_UUID,
  parseSerialNumber,
} from '@boardsesh/ble-protocol';
import {
  boardBleNative,
  type NativeBleConfigureBoardOptions,
  type NativeBleScanEvent,
} from '../../../modules/live-activity/src/index';
import type { BluetoothAdapter, BleConnection, DevicePickerFn, DiscoveredDevice } from './types';

const SCAN_TIMEOUT_MS = 30_000;

function uint8ArrayToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let byteIndex = 0; byteIndex < bytes.length; byteIndex++) {
    const value = bytes[byteIndex];
    hex += value.toString(16).padStart(2, '0');
  }
  return hex;
}

/// Adapter that drives the BoardBleManager Swift singleton via the
/// `@boardsesh/live-activity-module` Expo Module. iOS-only — guarded at the
/// factory level. Keeps the encoding-in-JS pattern the existing
/// `useBoardBluetooth` hook uses (climb frames → hex packet → native write),
/// but additionally calls `configureBoard` so that the widget intent path
/// (Dynamic Island next/prev → BoardBleManager.displayCurrentItemAwaitingReady)
/// has the board metadata it needs to encode without going through JS.
export class NativeIosBleAdapter implements BluetoothAdapter {
  private connectedDeviceId: string | null = null;
  private disconnectCallback: (() => void) | null = null;
  private disconnectSubscription: { remove: () => void } | null = null;

  constructor(private readonly devicePicker: DevicePickerFn) {
    if (!boardBleNative) {
      throw new Error('BoardBle native module not linked — rebuild the preview client');
    }
  }

  async isAvailable(): Promise<boolean> {
    const native = this.requireNative();
    const result = await native.isAvailable();
    return result.available;
  }

  async requestAndConnect(targetSerial?: string): Promise<BleConnection> {
    const native = this.requireNative();
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

    const scanSubscription = native.addListener('scanResult', (payload: NativeBleScanEvent) => {
      const device: DiscoveredDevice = {
        deviceId: payload.device.deviceId,
        name: payload.localName || payload.device.name || undefined,
        rssi: payload.rssi,
      };
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

    await native.startScan([AURORA_ADVERTISED_SERVICE_UUID, UART_SERVICE_UUID]);

    const scanTimeoutId = setTimeout(() => {
      void native.stopScan();
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
      scanSubscription.remove();
      await native.stopScan();
    }

    let selectedDeviceName: string | undefined;
    for (const device of devices.values()) {
      if (device.deviceId === selectedDeviceId) {
        selectedDeviceName = device.name;
        break;
      }
    }

    await native.connect(selectedDeviceId);

    this.connectedDeviceId = selectedDeviceId;
    this.disconnectSubscription = native.addListener('disconnected', (payload) => {
      if (payload.deviceId !== selectedDeviceId) return;
      this.connectedDeviceId = null;
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
    const native = this.requireNative();
    this.disconnectSubscription?.remove();
    this.disconnectSubscription = null;
    this.connectedDeviceId = null;
    await native.disconnect();
  }

  async write(data: Uint8Array, signal?: AbortSignal): Promise<void> {
    const native = this.requireNative();
    if (!this.connectedDeviceId) {
      throw new Error('Not connected');
    }
    if (signal?.aborted) {
      throw new DOMException('Write aborted', 'AbortError');
    }
    // Native side handles chunking (20-byte UART chunks with 5ms inter-chunk
    // delay) inside BoardBleManager, so we pass the full payload as a single
    // hex string.
    await native.write(uint8ArrayToHex(data));
  }

  onDisconnect(callback: () => void): () => void {
    this.disconnectCallback = callback;
    return () => {
      this.disconnectCallback = null;
    };
  }

  /// Persists the active board configuration into BoardBleManager via shared
  /// UserDefaults. Required for the widget intent path: when the user taps
  /// next/previous on the Dynamic Island, the intent calls
  /// `BoardBleManager.displayCurrentItemAwaitingReady(items, currentIndex)`
  /// which encodes the wall packet using this configuration. Without this,
  /// JS-driven writes still work (we already hex-encode in JS), but the
  /// Dynamic Island path silently no-ops because BoardBleManager has no
  /// configuration to encode against.
  async configureBoard(options: NativeBleConfigureBoardOptions): Promise<void> {
    const native = this.requireNative();
    await native.configureBoard(options);
  }

  private requireNative() {
    if (!boardBleNative) {
      throw new Error('BoardBle native module not linked');
    }
    return boardBleNative;
  }
}
