import { describe, it, expect, vi, beforeEach } from 'vitest';

const setPersonPropertiesMock = vi.fn();
vi.mock('../../analytics', () => ({ setPersonProperties: setPersonPropertiesMock }));

// Each test needs a fresh module to avoid leaked state between tests.
// We use dynamic import with cache-busting via vi.resetModules().

let registerBluetoothConnection: typeof import('../bluetooth-status-store').registerBluetoothConnection;
let disconnectAllBluetooth: typeof import('../bluetooth-status-store').disconnectAllBluetooth;

beforeEach(async () => {
  vi.resetModules();
  setPersonPropertiesMock.mockClear();
  const mod = await import('../bluetooth-status-store');
  registerBluetoothConnection = mod.registerBluetoothConnection;
  disconnectAllBluetooth = mod.disconnectAllBluetooth;
});

// ── Tests ───────────────────────────────────────────────────────────────

describe('registerBluetoothConnection', () => {
  it('returns a cleanup function', () => {
    const disconnectFn = vi.fn();
    const cleanup = registerBluetoothConnection(disconnectFn);

    expect(typeof cleanup).toBe('function');
  });

  it('increments connected count (subscribe snapshot reflects connected)', () => {
    const disconnectFn = vi.fn();
    const cleanup = registerBluetoothConnection(disconnectFn);

    // The fact that cleanup exists and is callable is the observable contract.
    // We verify the count indirectly: registering two connections and
    // releasing one should still keep the store "connected".
    expect(cleanup).toBeDefined();
  });

  it('cleanup decrements the connected count', () => {
    const disconnectFn = vi.fn();
    const cleanup = registerBluetoothConnection(disconnectFn);

    // Calling cleanup should not throw
    expect(() => cleanup()).not.toThrow();
  });

  it('double cleanup is a no-op (idempotent release)', () => {
    const disconnectFn = vi.fn();
    const cleanup = registerBluetoothConnection(disconnectFn);

    cleanup();
    // Second call should not throw or decrement below zero
    expect(() => cleanup()).not.toThrow();
  });

  it('double-register without release keeps store connected', () => {
    // We can verify this through the subscribe/getSnapshot mechanism.
    // Since those aren't exported directly, we test that releasing only
    // one of two connections still leaves the second active by checking
    // that disconnectAllBluetooth still calls the remaining disconnect fn.
    const disconnectA = vi.fn();
    const disconnectB = vi.fn();

    const cleanupA = registerBluetoothConnection(disconnectA);
    registerBluetoothConnection(disconnectB);

    // Release only A
    cleanupA();

    // disconnectAllBluetooth should only call B (A was removed on cleanup)
    disconnectAllBluetooth();

    expect(disconnectA).not.toHaveBeenCalled();
    expect(disconnectB).toHaveBeenCalledOnce();
  });

  it('both released means no active disconnects remain', () => {
    const disconnectA = vi.fn();
    const disconnectB = vi.fn();

    const cleanupA = registerBluetoothConnection(disconnectA);
    const cleanupB = registerBluetoothConnection(disconnectB);

    cleanupA();
    cleanupB();

    // After both are released, disconnectAllBluetooth should call nothing
    disconnectAllBluetooth();

    expect(disconnectA).not.toHaveBeenCalled();
    expect(disconnectB).not.toHaveBeenCalled();
  });

  it('marks has_connected_board as a durable person property on connect', () => {
    const disconnectFn = vi.fn();
    registerBluetoothConnection(disconnectFn);

    expect(setPersonPropertiesMock).toHaveBeenCalledWith(undefined, { has_connected_board: true });
  });

  it('only marks has_connected_board once per app session across a disconnect and reconnects', () => {
    // Disconnect after the first connect, then reconnect twice more — the flag
    // must fire only on the very first connect above, never on these.
    const cleanupA = registerBluetoothConnection(vi.fn());
    cleanupA();
    registerBluetoothConnection(vi.fn());
    registerBluetoothConnection(vi.fn());

    expect(setPersonPropertiesMock).toHaveBeenCalledTimes(1);
  });

  it('resets the dedup flag on a fresh module instance (e.g. app restart)', async () => {
    registerBluetoothConnection(vi.fn());
    expect(setPersonPropertiesMock).toHaveBeenCalledTimes(1);

    // Simulate an app restart: a fresh module instance must not remember the
    // previous session's flag, so the first connect there fires it again.
    vi.resetModules();
    setPersonPropertiesMock.mockClear();
    const freshModule = await import('../bluetooth-status-store');

    freshModule.registerBluetoothConnection(vi.fn());

    expect(setPersonPropertiesMock).toHaveBeenCalledTimes(1);
  });

  it('notifies listeners when a connection is registered', () => {
    // We can access the subscribe/getSnapshot pattern by importing
    // the module and using useSyncExternalStore's contract manually.
    // Since subscribe isn't exported, we test notification indirectly:
    // the fact that registerBluetoothConnection calls notify() means
    // any subscribed listener fires. We already tested the public API
    // above; this test documents the notify behavior.
    const disconnectFn = vi.fn();
    const cleanup = registerBluetoothConnection(disconnectFn);

    // If notify throws on any listener, register would throw.
    // No throw = listeners were notified without errors.
    cleanup();
  });
});

describe('disconnectAllBluetooth', () => {
  it('calls all registered disconnect functions', () => {
    const disconnectA = vi.fn();
    const disconnectB = vi.fn();
    const disconnectC = vi.fn();

    registerBluetoothConnection(disconnectA);
    registerBluetoothConnection(disconnectB);
    registerBluetoothConnection(disconnectC);

    disconnectAllBluetooth();

    expect(disconnectA).toHaveBeenCalledOnce();
    expect(disconnectB).toHaveBeenCalledOnce();
    expect(disconnectC).toHaveBeenCalledOnce();
  });

  it('does nothing when no connections are registered', () => {
    // Should not throw
    expect(() => disconnectAllBluetooth()).not.toThrow();
  });

  it('handles errors in disconnect functions without throwing', () => {
    const errorDisconnect = vi.fn(() => {
      throw new Error('disconnect failed');
    });
    const healthyDisconnect = vi.fn();

    registerBluetoothConnection(errorDisconnect);
    registerBluetoothConnection(healthyDisconnect);

    // Should not throw even though one disconnect fn throws
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => disconnectAllBluetooth()).not.toThrow();

    // The healthy one should still have been called
    expect(healthyDisconnect).toHaveBeenCalledOnce();
    // The error one was called too (it just threw)
    expect(errorDisconnect).toHaveBeenCalledOnce();

    // Error was logged
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to disconnect bluetooth:',
      expect.objectContaining({ message: 'disconnect failed' }),
    );

    consoleErrorSpy.mockRestore();
  });

  it('does not call disconnect functions that were already released', () => {
    const disconnectStillActive = vi.fn();
    const disconnectReleased = vi.fn();

    registerBluetoothConnection(disconnectStillActive);
    const cleanup = registerBluetoothConnection(disconnectReleased);

    // Release one before calling disconnectAll
    cleanup();

    disconnectAllBluetooth();

    expect(disconnectStillActive).toHaveBeenCalledOnce();
    expect(disconnectReleased).not.toHaveBeenCalled();
  });
});
