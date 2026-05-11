import { describe, it, expect, beforeEach, afterEach, vi } from 'vite-plus/test';
import { closeCapacitorBrowser } from '../capacitor-browser';

describe('closeCapacitorBrowser', () => {
  const mockClose = vi.fn();
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockClose.mockReset();
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    Object.defineProperty(window, 'Capacitor', {
      value: {
        isNativePlatform: () => true,
        getPlatform: () => 'ios',
        Plugins: {
          Browser: { close: mockClose },
        },
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
    Object.defineProperty(window, 'Capacitor', {
      value: undefined,
      writable: true,
      configurable: true,
    });
  });

  it('resolves silently when the plugin is unavailable', async () => {
    Object.defineProperty(window, 'Capacitor', {
      value: undefined,
      writable: true,
      configurable: true,
    });
    await expect(closeCapacitorBrowser()).resolves.toBeUndefined();
  });

  it('calls Browser.close() when available', async () => {
    mockClose.mockResolvedValue(undefined);
    await closeCapacitorBrowser();
    expect(mockClose).toHaveBeenCalledOnce();
  });

  it('swallows the "No active window to close!" iOS error', async () => {
    mockClose.mockRejectedValue(new Error('No active window to close!'));
    await expect(closeCapacitorBrowser()).resolves.toBeUndefined();
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('swallows the error case-insensitively (defensive)', async () => {
    mockClose.mockRejectedValue(new Error('NO ACTIVE WINDOW TO CLOSE!'));
    await expect(closeCapacitorBrowser()).resolves.toBeUndefined();
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('swallows the older "No browser is open" phrasing', async () => {
    mockClose.mockRejectedValue(new Error('No browser is open'));
    await expect(closeCapacitorBrowser()).resolves.toBeUndefined();
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('handles non-Error rejection values', async () => {
    mockClose.mockRejectedValue('No active window to close!');
    await expect(closeCapacitorBrowser()).resolves.toBeUndefined();
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('logs but does not throw on unexpected errors', async () => {
    mockClose.mockRejectedValue(new Error('Plugin not implemented'));
    await expect(closeCapacitorBrowser()).resolves.toBeUndefined();
    expect(consoleWarnSpy).toHaveBeenCalledWith('[Capacitor Browser] close() failed unexpectedly:', expect.any(Error));
  });
});
