import type { BleConnection, BluetoothAdapter, DevicePickerFn, DiscoveredDevice } from './types';
import {
  AURORA_SCAN_SERVICE_UUIDS,
  parseSerialNumber,
} from '@/app/components/board-bluetooth-control/bluetooth-aurora';

const SCAN_TIMEOUT_MS = 30_000;

type NativeBoardBlePlugin = NonNullable<NonNullable<Window['Capacitor']>['Plugins']['BoardBle']>;
type NativeBoardBleListenerHandle = Awaited<ReturnType<NativeBoardBlePlugin['addListener']>>;

type NativeScanResult = {
  device?: { deviceId?: string; name?: string };
  localName?: string;
  rssi?: number;
};

function getNativeBoardBlePlugin(): NativeBoardBlePlugin {
  const plugin = window.Capacitor?.Plugins?.BoardBle;
  if (!plugin) {
    throw new Error('Native BoardBle plugin not available');
  }
  return plugin;
}

function toHexString(data: Uint8Array): string {
  return Array.from(data)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function createAbortError(): DOMException | Error {
  if (typeof DOMException === 'function') {
    return new DOMException('Write aborted', 'AbortError');
  }
  const error = new Error('Write aborted');
  error.name = 'AbortError';
  return error;
}

async function normalizeListenerHandle(
  handle: NativeBoardBleListenerHandle | Promise<NativeBoardBleListenerHandle>,
): Promise<NativeBoardBleListenerHandle> {
  return await Promise.resolve(handle);
}

function stopScanQuietly(plugin: NativeBoardBlePlugin): Promise<void> {
  return plugin.stopScan().catch(() => {});
}

export class NativeIosBleAdapter implements BluetoothAdapter {
  constructor(private readonly devicePicker?: DevicePickerFn) {}

  private deviceId: string | null = null;
  private disconnectCallback: (() => void) | null = null;
  private disconnectListenerHandle: NativeBoardBleListenerHandle | null = null;

  async isAvailable(): Promise<boolean> {
    try {
      const result = await getNativeBoardBlePlugin().isAvailable();
      return result.available;
    } catch {
      return false;
    }
  }

  async requestAndConnect(targetSerial?: string): Promise<BleConnection> {
    if (!this.devicePicker) {
      throw new Error('Native iOS BLE requires the Boardsesh device picker');
    }

    const plugin = getNativeBoardBlePlugin();
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

    const scanListener = await normalizeListenerHandle(
      plugin.addListener('scanResult', (data) => {
        const result = data as NativeScanResult;
        const deviceId = result.device?.deviceId;
        if (!deviceId) return;

        const device: DiscoveredDevice = {
          deviceId,
          name: result.localName || result.device?.name,
          rssi: result.rssi ?? 0,
        };
        const dedupeKey = device.name || device.deviceId;
        devices.set(dedupeKey, device);
        pushDevices();

        if (autoSelectResolve && targetSerial) {
          const serial = parseSerialNumber(device.name);
          if (serial === targetSerial) {
            autoSelectResolve(device.deviceId);
            autoSelectResolve = null;
          }
        }
      }),
    );

    await plugin.startScan({ services: [...AURORA_SCAN_SERVICE_UUIDS] });

    const scanTimeoutId = setTimeout(() => {
      void stopScanQuietly(plugin);
      if (autoSelectReject) {
        autoSelectReject(new Error('Target board not found during scan'));
        autoSelectReject = null;
      }
    }, SCAN_TIMEOUT_MS);

    let selectedDeviceId: string;
    let selectedDeviceName: string | undefined;

    try {
      selectedDeviceId = await selectionPromise;
    } finally {
      clearTimeout(scanTimeoutId);
      await scanListener.remove();
      await stopScanQuietly(plugin);
    }

    for (const device of devices.values()) {
      if (device.deviceId === selectedDeviceId) {
        selectedDeviceName = device.name;
        break;
      }
    }

    await plugin.connect({ deviceId: selectedDeviceId });
    this.deviceId = selectedDeviceId;

    this.disconnectListenerHandle = await normalizeListenerHandle(
      plugin.addListener('disconnected', (data) => {
        if (data.deviceId === this.deviceId) {
          this.deviceId = null;
          this.disconnectListenerHandle = null;
          this.disconnectCallback?.();
        }
      }),
    );

    return {
      deviceId: selectedDeviceId,
      deviceName: selectedDeviceName,
    };
  }

  async disconnect(): Promise<void> {
    if (this.disconnectListenerHandle) {
      await this.disconnectListenerHandle.remove();
      this.disconnectListenerHandle = null;
    }

    if (this.deviceId) {
      try {
        await getNativeBoardBlePlugin().disconnect();
      } catch {
        // Ignore disconnect errors; the peripheral may already be gone.
      }
      this.deviceId = null;
    }
  }

  async write(data: Uint8Array, signal?: AbortSignal): Promise<void> {
    if (!this.deviceId) {
      throw new Error('Not connected');
    }
    if (signal?.aborted) {
      throw createAbortError();
    }

    const plugin = getNativeBoardBlePlugin();
    const writePromise = plugin.write({ value: toHexString(data) });

    if (!signal) {
      await writePromise;
      return;
    }

    let abortHandler: (() => void) | null = null;
    const abortPromise = new Promise<never>((_, reject) => {
      abortHandler = () => {
        void plugin.cancelWrites?.().catch(() => {});
        reject(createAbortError());
      };
      signal.addEventListener('abort', abortHandler, { once: true });
    });

    try {
      await Promise.race([writePromise, abortPromise]);
    } finally {
      if (abortHandler) {
        signal.removeEventListener('abort', abortHandler);
      }
    }
  }

  onDisconnect(callback: () => void): () => void {
    this.disconnectCallback = callback;
    return () => {
      this.disconnectCallback = null;
    };
  }

  async configureBoard(options: {
    boardName: string;
    layoutId: number;
    sizeId: number;
    apiLevel?: number;
    deviceName?: string;
    colorOverrides?: Record<string, string>;
  }): Promise<void> {
    await getNativeBoardBlePlugin().configureBoard(options);
  }
}
