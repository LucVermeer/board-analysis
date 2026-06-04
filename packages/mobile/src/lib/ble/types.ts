export type BleConnection = {
  deviceId: string;
  deviceName?: string;
};

export type DiscoveredDevice = {
  deviceId: string;
  name?: string;
  rssi: number;
};

// The picker subscribes for live device updates and, optionally, a one-shot
// signal that the scan has stopped (timeout) so it can drop its "scanning"
// spinner instead of implying a scan that's no longer running.
export type DevicePickerFn = (
  subscribe: (onUpdate: (devices: DiscoveredDevice[]) => void, onScanStopped?: () => void) => void,
) => Promise<string>;

export type BluetoothAdapter = {
  isAvailable(): Promise<boolean>;
  requestAndConnect(targetSerial?: string): Promise<BleConnection>;
  disconnect(): Promise<void>;
  write(data: Uint8Array, signal?: AbortSignal): Promise<void>;
  onDisconnect(callback: () => void): () => void;
};
