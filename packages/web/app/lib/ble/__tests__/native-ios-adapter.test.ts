import { afterAll, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { NativeIosBleAdapter } from '../native-ios-adapter';
import type { DiscoveredDevice } from '../types';

const mockListenerRemove = vi.fn().mockResolvedValue(undefined);
let scanResultCallback: ((data: Record<string, unknown>) => void) | null = null;
let disconnectedCallback: ((data: Record<string, unknown>) => void) | null = null;

const mockBoardBlePlugin = {
  isAvailable: vi.fn().mockResolvedValue({ available: true }),
  startScan: vi.fn().mockResolvedValue(undefined),
  stopScan: vi.fn().mockResolvedValue(undefined),
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
  write: vi.fn().mockResolvedValue(undefined),
  cancelWrites: vi.fn().mockResolvedValue(undefined),
  configureBoard: vi.fn().mockResolvedValue(undefined),
  addListener: vi.fn().mockImplementation((eventName: string, callback: (data: Record<string, unknown>) => void) => {
    if (eventName === 'scanResult') {
      scanResultCallback = callback;
    }
    if (eventName === 'disconnected') {
      disconnectedCallback = callback;
    }
    return { remove: mockListenerRemove };
  }),
};

const originalCapacitor = window.Capacitor;

Object.defineProperty(window, 'Capacitor', {
  value: {
    isNativePlatform: () => true,
    getPlatform: () => 'ios',
    Plugins: {
      BoardBle: mockBoardBlePlugin,
    },
  },
  writable: true,
  configurable: true,
});

afterAll(() => {
  if (originalCapacitor === undefined) {
    delete (window as Window & { Capacitor?: unknown }).Capacitor;
  } else {
    window.Capacitor = originalCapacitor;
  }
});

describe('NativeIosBleAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBoardBlePlugin.write.mockResolvedValue(undefined);
    mockBoardBlePlugin.cancelWrites.mockResolvedValue(undefined);
    mockBoardBlePlugin.configureBoard.mockResolvedValue(undefined);
    scanResultCallback = null;
    disconnectedCallback = null;
  });

  it('scans with the shared picker and connects to the selected device', async () => {
    let resolvePickedDevice: (deviceId: string) => void = () => {
      throw new Error('Picker promise was not initialized');
    };
    let pickerDevices: DiscoveredDevice[] = [];
    const adapter = new NativeIosBleAdapter((subscribe) => {
      subscribe((devices) => {
        pickerDevices = devices;
      });
      return new Promise<string>((resolve) => {
        resolvePickedDevice = resolve;
      });
    });

    const connectionPromise = adapter.requestAndConnect();
    await Promise.resolve();

    scanResultCallback?.({
      device: { deviceId: 'native-dev-1', name: 'Kilter Board#123@3' },
      localName: 'Kilter Board#123@3',
      rssi: -55,
    });
    resolvePickedDevice('native-dev-1');

    const connection = await connectionPromise;

    expect(pickerDevices).toEqual([{ deviceId: 'native-dev-1', name: 'Kilter Board#123@3', rssi: -55 }]);
    expect(connection).toEqual({ deviceId: 'native-dev-1', deviceName: 'Kilter Board#123@3' });
    expect(mockBoardBlePlugin.startScan).toHaveBeenCalledWith({
      services: ['4488b571-7806-4df6-bcff-a2897e4953ff'],
    });
    expect(mockBoardBlePlugin.connect).toHaveBeenCalledWith({ deviceId: 'native-dev-1' });
    expect(mockBoardBlePlugin.stopScan).toHaveBeenCalled();
  });

  it('writes packets as a hex string through the native plugin', async () => {
    let resolvePickedDevice: (deviceId: string) => void = () => {
      throw new Error('Picker promise was not initialized');
    };
    const adapter = new NativeIosBleAdapter(() => {
      return new Promise<string>((resolve) => {
        resolvePickedDevice = resolve;
      });
    });

    const connectionPromise = adapter.requestAndConnect();
    await Promise.resolve();
    scanResultCallback?.({
      device: { deviceId: 'native-dev-1', name: 'Kilter Board#123@3' },
      localName: 'Kilter Board#123@3',
      rssi: -55,
    });
    resolvePickedDevice('native-dev-1');
    await connectionPromise;

    await adapter.write(new Uint8Array([0x01, 0x02, 0xff]));

    expect(mockBoardBlePlugin.write).toHaveBeenCalledWith({ value: '0102ff' });
  });

  it('cancels the native write when an abort signal fires after the bridge call starts', async () => {
    let resolvePickedDevice: (deviceId: string) => void = () => {
      throw new Error('Picker promise was not initialized');
    };
    const adapter = new NativeIosBleAdapter(() => {
      return new Promise<string>((resolve) => {
        resolvePickedDevice = resolve;
      });
    });

    const connectionPromise = adapter.requestAndConnect();
    await Promise.resolve();
    scanResultCallback?.({
      device: { deviceId: 'native-dev-1', name: 'Kilter Board#123@3' },
      localName: 'Kilter Board#123@3',
      rssi: -55,
    });
    resolvePickedDevice('native-dev-1');
    await connectionPromise;

    mockBoardBlePlugin.write.mockReturnValue(new Promise<void>(() => {}));
    const abortController = new AbortController();
    const writePromise = adapter.write(new Uint8Array([0x01, 0x02, 0xff]), abortController.signal);

    abortController.abort();

    await expect(writePromise).rejects.toMatchObject({ name: 'AbortError' });
    expect(mockBoardBlePlugin.cancelWrites).toHaveBeenCalledOnce();
  });

  it('forwards board configuration for background native writes', async () => {
    const adapter = new NativeIosBleAdapter();

    await adapter.configureBoard({
      boardName: 'kilter',
      layoutId: 8,
      sizeId: 25,
      apiLevel: 2,
      deviceName: 'Kilter Board#123@2',
      colorOverrides: { HAND: '#ffffff' },
    });

    expect(mockBoardBlePlugin.configureBoard).toHaveBeenCalledWith({
      boardName: 'kilter',
      layoutId: 8,
      sizeId: 25,
      apiLevel: 2,
      deviceName: 'Kilter Board#123@2',
      colorOverrides: { HAND: '#ffffff' },
    });
  });

  it('fires disconnect callbacks from the native event stream', async () => {
    let resolvePickedDevice: (deviceId: string) => void = () => {
      throw new Error('Picker promise was not initialized');
    };
    const onDisconnect = vi.fn();
    const adapter = new NativeIosBleAdapter(() => {
      return new Promise<string>((resolve) => {
        resolvePickedDevice = resolve;
      });
    });
    adapter.onDisconnect(onDisconnect);

    const connectionPromise = adapter.requestAndConnect();
    await Promise.resolve();
    scanResultCallback?.({
      device: { deviceId: 'native-dev-1', name: 'Kilter Board#123@3' },
      localName: 'Kilter Board#123@3',
      rssi: -55,
    });
    resolvePickedDevice('native-dev-1');
    await connectionPromise;

    disconnectedCallback?.({ deviceId: 'native-dev-1' });

    expect(onDisconnect).toHaveBeenCalledOnce();
  });
});
