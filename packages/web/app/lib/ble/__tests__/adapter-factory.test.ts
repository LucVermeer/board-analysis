import { describe, it, expect, beforeEach, vi } from 'vite-plus/test';
import { createBluetoothAdapter, _resetFactoryCache } from '../adapter-factory';
import { isCapacitor, isCapacitorWebView, waitForCapacitor, supportsNativeIosBoardBle } from '../capacitor-utils';

// Mock capacitor-utils to allow per-test control over platform detection.
// vi.mock is hoisted before imports, so adapter-factory sees the mocked version.
vi.mock('../capacitor-utils', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    isCapacitor: vi.fn().mockReturnValue(false),
    isCapacitorWebView: vi.fn().mockReturnValue(false),
    waitForCapacitor: vi.fn().mockResolvedValue(false),
    supportsNativeIosBoardBle: vi.fn().mockReturnValue(false),
  };
});

describe('adapter-factory', () => {
  beforeEach(() => {
    _resetFactoryCache();
    vi.clearAllMocks();
    vi.mocked(isCapacitor).mockReturnValue(false);
    vi.mocked(isCapacitorWebView).mockReturnValue(false);
    vi.mocked(waitForCapacitor).mockResolvedValue(false);
    vi.mocked(supportsNativeIosBoardBle).mockReturnValue(false);
  });

  describe('_resetFactoryCache', () => {
    it('is a function that clears the internal cache', () => {
      expect(typeof _resetFactoryCache).toBe('function');
      // The function should not throw
      _resetFactoryCache();
    });

    it('allows multiple adapter detections by resetting cache state', async () => {
      // First call - should detect platform
      const adapter1 = await createBluetoothAdapter('kilter');
      expect(adapter1).toBeDefined();
      expect(typeof adapter1.isAvailable).toBe('function');

      // Reset cache to allow re-detection
      _resetFactoryCache();

      // Should be able to create adapter again
      const adapter2 = await createBluetoothAdapter('kilter');
      expect(adapter2).toBeDefined();
      expect(typeof adapter2.isAvailable).toBe('function');
    });
  });

  describe('createBluetoothAdapter', () => {
    it('returns an adapter with all required methods', async () => {
      const adapter = await createBluetoothAdapter('kilter');

      // Verify the adapter implements the BluetoothAdapter interface
      expect(typeof adapter.isAvailable).toBe('function');
      expect(typeof adapter.requestAndConnect).toBe('function');
      expect(typeof adapter.disconnect).toBe('function');
      expect(typeof adapter.write).toBe('function');
      expect(typeof adapter.onDisconnect).toBe('function');
    });

    it('returns a WebBluetoothAdapter when Capacitor is not present', async () => {
      const adapter1 = await createBluetoothAdapter('kilter');
      const adapter2 = await createBluetoothAdapter('tension');

      // Factory is cached after first detection — both board names get the same adapter type
      expect(adapter1.constructor.name).toBe('WebBluetoothAdapter');
      expect(adapter2.constructor.name).toBe('WebBluetoothAdapter');
    });

    it('returns a CapacitorBleAdapter when Capacitor is present', async () => {
      vi.mocked(isCapacitor).mockReturnValue(true);

      const adapter = await createBluetoothAdapter('kilter');

      expect(adapter.constructor.name).toBe('CapacitorBleAdapter');
    });

    it('returns a NativeIosBleAdapter for Aurora boards when the native plugin is present', async () => {
      vi.mocked(isCapacitor).mockReturnValue(true);
      vi.mocked(supportsNativeIosBoardBle).mockReturnValue(true);

      const adapter = await createBluetoothAdapter('kilter');

      expect(adapter.constructor.name).toBe('NativeIosBleAdapter');
    });

    it('keeps MoonBoard on the Capacitor adapter even when native BoardBle exists', async () => {
      vi.mocked(isCapacitor).mockReturnValue(true);
      vi.mocked(supportsNativeIosBoardBle).mockReturnValue(true);

      const adapter = await createBluetoothAdapter('moonboard');

      expect(adapter.constructor.name).toBe('CapacitorBleAdapter');
    });

    it('waits for Capacitor bridge when running in a WebView before selecting adapter', async () => {
      // Simulate WebView context where bridge is not yet injected
      vi.mocked(isCapacitorWebView).mockReturnValue(true);
      // Bridge never becomes available (timeout)
      vi.mocked(waitForCapacitor).mockResolvedValue(false);

      const adapter = await createBluetoothAdapter('kilter');

      expect(vi.mocked(waitForCapacitor)).toHaveBeenCalledOnce();
      // Timed out waiting — falls back to WebBluetoothAdapter
      expect(adapter.constructor.name).toBe('WebBluetoothAdapter');
    });

    it('uses CapacitorBleAdapter when WebView bridge becomes available after waiting', async () => {
      // Simulate WebView context: isCapacitor() starts false, then true after wait
      vi.mocked(isCapacitorWebView).mockReturnValue(true);
      vi.mocked(waitForCapacitor).mockResolvedValue(true);
      vi.mocked(isCapacitor)
        .mockReturnValueOnce(false) // first check: !isCapacitor() → enters the wait branch
        .mockReturnValue(true); // second check: isCapacitor() → selects CapacitorBleAdapter

      const adapter = await createBluetoothAdapter('kilter');

      expect(vi.mocked(waitForCapacitor)).toHaveBeenCalledOnce();
      expect(adapter.constructor.name).toBe('CapacitorBleAdapter');
    });

    it('skips WebView bridge wait when Capacitor is already present', async () => {
      vi.mocked(isCapacitor).mockReturnValue(true);

      await createBluetoothAdapter('kilter');

      // Bridge is already ready — no need to poll for it
      expect(vi.mocked(waitForCapacitor)).not.toHaveBeenCalled();
    });
  });
});
