import { AURORA_ADVERTISED_SERVICE_UUID, UART_SERVICE_UUID, parseSerialNumber } from '@boardsesh/ble-protocol';
import {
  boardBleNative,
  type NativeBleConfigureBoardOptions,
  type NativeBleScanEvent,
} from '../../../modules/live-activity/src/index';
import type { BluetoothAdapter, BleConnection, DevicePickerFn, DiscoveredDevice } from './types';
import { SCAN_TIMEOUT_MS, SERIAL_RECONNECT_GRACE_MS } from '@boardsesh/ble-protocol/scan-constants';

function uint8ArrayToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let byteIndex = 0; byteIndex < bytes.length; byteIndex++) {
    const value = bytes[byteIndex];
    hex += value.toString(16).padStart(2, '0');
  }
  return hex;
}

// Adapter that drives the BoardBleManager Swift singleton via the
// `@boardsesh/live-activity-module` Expo Module. iOS-only — guarded at the
// factory level. Keeps the encoding-in-JS pattern the existing
// `useBoardBluetooth` hook uses (climb frames → hex packet → native write),
// but additionally calls `configureBoard` so that the widget intent path
// (Dynamic Island next/prev → BoardBleManager.displayCurrentItemAwaitingReady)
// has the board metadata it needs to encode without going through JS.
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

  // The scan/select flow (silent serial auto-select → grace-window picker
  // fallback → scan timeout) mirrors RNBleAdapter.requestAndConnect and the web
  // adapters. Kept in lockstep by hand; if you change one, change the others.
  async requestAndConnect(targetSerial?: string): Promise<BleConnection> {
    const native = this.requireNative();
    const devices = new Map<string, DiscoveredDevice>();
    let updateListener: ((devices: DiscoveredDevice[]) => void) | null = null;
    let scanStoppedListener: (() => void) | null = null;
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
      this.devicePicker((onUpdate, onScanStopped) => {
        updateListener = onUpdate;
        scanStoppedListener = onScanStopped ?? null;
        pushDevices();
      }).then(resolveSelection, rejectSelection);
    };

    // No target serial → straight to the picker.
    if (!targetSerial) {
      openPicker();
    }

    const scanSubscription = native.addListener('scanResult', (payload: NativeBleScanEvent) => {
      const device: DiscoveredDevice = {
        deviceId: payload.device.deviceId,
        name: payload.localName || payload.device.name || undefined,
        rssi: payload.rssi,
      };
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
    });

    // startScan and the timers live inside the try so that a startScan failure
    // (Bluetooth toggled off / permission revoked mid-flow) still runs the
    // finally — otherwise the scanResult listener would leak and the scan stay
    // running.
    let pickerFallbackId: ReturnType<typeof setTimeout> | undefined;
    let scanTimeoutId: ReturnType<typeof setTimeout> | undefined;
    let selectedDeviceId: string;
    try {
      await native.startScan([AURORA_ADVERTISED_SERVICE_UUID, UART_SERVICE_UUID]);

      // Grace window: if the stored serial hasn't matched shortly, open the
      // picker (scan keeps running so it live-updates) instead of waiting out
      // the full scan window and failing. Matches the web reconnect-by-serial
      // fallback.
      pickerFallbackId = targetSerial
        ? setTimeout(() => {
            if (autoSelecting) openPicker();
          }, SERIAL_RECONNECT_GRACE_MS)
        : undefined;

      scanTimeoutId = setTimeout(() => {
        void native.stopScan();
        // Belt-and-suspenders: make sure the picker is open even if the grace
        // window never fired.
        if (autoSelecting) openPicker();
        // The picker is showing but nothing ever advertised — surface the empty
        // result so the sheet doesn't spin forever.
        if (pickerOpened && devices.size === 0) {
          rejectSelection(new Error('No boards found within scan window'));
        } else {
          // Devices were found but none picked yet — tell the picker the scan
          // stopped so it drops the spinner instead of implying a live scan.
          scanStoppedListener?.();
        }
      }, SCAN_TIMEOUT_MS);

      selectedDeviceId = await selectionPromise;
    } finally {
      if (pickerFallbackId) clearTimeout(pickerFallbackId);
      if (scanTimeoutId) clearTimeout(scanTimeoutId);
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

  // Persists the active board configuration into BoardBleManager via shared
  // UserDefaults. Required for the widget intent path: when the user taps
  // next/previous on the Dynamic Island, the intent calls
  // `BoardBleManager.displayCurrentItemAwaitingReady(items, currentIndex)`
  // which encodes the wall packet using this configuration. Without this,
  // JS-driven writes still work (we already hex-encode in JS), but the
  // Dynamic Island path silently no-ops because BoardBleManager has no
  // configuration to encode against.
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
