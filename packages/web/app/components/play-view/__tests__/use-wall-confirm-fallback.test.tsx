// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vite-plus/test';
import { renderHook, act } from '@testing-library/react';
import { useWallConfirmFallback, WALL_CONFIRM_TIMEOUT_MS } from '../use-wall-confirm-fallback';
import { emitWallConfirm } from '../../board-bluetooth-control/wall-confirm-bus';

const mockTrack = vi.fn();
vi.mock('@/app/lib/analytics', () => ({
  track: (...args: unknown[]) => mockTrack(...args),
}));

const mockIsNativeApp = vi.fn(() => false);
vi.mock('@/app/lib/ble/capacitor-utils', () => ({
  isNativeApp: () => mockIsNativeApp(),
}));

type Deps = Parameters<typeof useWallConfirmFallback>[0];

const baseClimb = {
  climbUuid: 'climb-1',
  frames: 'p1r12',
  mirrored: false,
  mode: 'solo' as const,
  boardLayout: 'Original',
};

function makeDeps(overrides: Partial<Deps> = {}): Deps {
  return {
    isBluetoothConnected: false,
    isBluetoothSupported: true,
    lastConnectedBoardSerial: null,
    bluetoothConnect: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

describe('useWallConfirmFallback', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockTrack.mockClear();
    mockIsNativeApp.mockReturnValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('clears the timer when a matching wall-confirm arrives within the window', () => {
    const deps = makeDeps();
    const { result } = renderHook(() => useWallConfirmFallback(deps));

    act(() => {
      result.current.armWatcher(baseClimb);
    });

    // Fire the matching confirm before the 2s window elapses.
    act(() => {
      emitWallConfirm('climb-1');
    });

    // Advance past the timeout and verify the fallback did NOT run.
    act(() => {
      vi.advanceTimersByTime(WALL_CONFIRM_TIMEOUT_MS + 100);
    });

    expect(deps.bluetoothConnect).not.toHaveBeenCalled();
    expect(mockTrack).not.toHaveBeenCalled();
  });

  it('ignores wall-confirms for a different climb', () => {
    const deps = makeDeps();
    const { result } = renderHook(() => useWallConfirmFallback(deps));

    act(() => {
      result.current.armWatcher(baseClimb);
    });

    // Confirm fires for a different climb — should NOT dismiss our watcher.
    act(() => {
      emitWallConfirm('different-climb');
    });

    act(() => {
      vi.advanceTimersByTime(WALL_CONFIRM_TIMEOUT_MS + 100);
    });

    // The fallback should have run — by default no BLE connection, no stored
    // serial, BLE supported → picker fallback.
    expect(deps.bluetoothConnect).toHaveBeenCalledOnce();
    expect(deps.bluetoothConnect).toHaveBeenCalledWith('p1r12', false);
    expect(mockTrack).toHaveBeenCalledWith('Wall Confirm Timeout', {
      mode: 'solo',
      fallback: 'picker',
      boardLayout: 'Original',
    });
  });

  it('opens the picker when timeout fires with no stored serial', () => {
    const deps = makeDeps({ lastConnectedBoardSerial: null });
    const { result } = renderHook(() => useWallConfirmFallback(deps));

    act(() => {
      result.current.armWatcher({ ...baseClimb, mode: 'party' });
    });

    act(() => {
      vi.advanceTimersByTime(WALL_CONFIRM_TIMEOUT_MS);
    });

    // Picker path: connect called with NO targetSerial arg.
    expect(deps.bluetoothConnect).toHaveBeenCalledOnce();
    expect(deps.bluetoothConnect).toHaveBeenCalledWith('p1r12', false);
    expect(mockTrack).toHaveBeenCalledWith('Wall Confirm Timeout', {
      mode: 'party',
      fallback: 'picker',
      boardLayout: 'Original',
    });
  });

  it('auto-connects to stored serial when on native shell', () => {
    mockIsNativeApp.mockReturnValue(true);
    const deps = makeDeps({ lastConnectedBoardSerial: 'serial-42' });
    const { result } = renderHook(() => useWallConfirmFallback(deps));

    act(() => {
      result.current.armWatcher({ ...baseClimb, mode: 'party' });
    });

    act(() => {
      vi.advanceTimersByTime(WALL_CONFIRM_TIMEOUT_MS);
    });

    expect(deps.bluetoothConnect).toHaveBeenCalledOnce();
    expect(deps.bluetoothConnect).toHaveBeenCalledWith('p1r12', false, 'serial-42');
    expect(mockTrack).toHaveBeenCalledWith('Wall Confirm Timeout', {
      mode: 'party',
      fallback: 'auto_connect',
      boardLayout: 'Original',
    });
  });

  it('falls back to picker when stored serial exists but not on native shell', () => {
    // mockIsNativeApp returns false by default — this models a desktop web
    // browser that happens to have a session-recorded board serial. The
    // safer behaviour is to show the picker rather than silently auto-
    // connect to a serial the user never explicitly chose on this device.
    const deps = makeDeps({ lastConnectedBoardSerial: 'serial-42' });
    const { result } = renderHook(() => useWallConfirmFallback(deps));

    act(() => {
      result.current.armWatcher(baseClimb);
    });

    act(() => {
      vi.advanceTimersByTime(WALL_CONFIRM_TIMEOUT_MS);
    });

    expect(deps.bluetoothConnect).toHaveBeenCalledOnce();
    expect(deps.bluetoothConnect).toHaveBeenCalledWith('p1r12', false);
    expect(mockTrack).toHaveBeenCalledWith('Wall Confirm Timeout', expect.objectContaining({ fallback: 'picker' }));
  });

  it('does nothing when already BLE-connected (already_connected path)', () => {
    const deps = makeDeps({ isBluetoothConnected: true });
    const { result } = renderHook(() => useWallConfirmFallback(deps));

    act(() => {
      result.current.armWatcher(baseClimb);
    });

    act(() => {
      vi.advanceTimersByTime(WALL_CONFIRM_TIMEOUT_MS);
    });

    expect(deps.bluetoothConnect).not.toHaveBeenCalled();
    expect(mockTrack).toHaveBeenCalledWith('Wall Confirm Timeout', {
      mode: 'solo',
      fallback: 'already_connected',
      boardLayout: 'Original',
    });
  });

  it('reports unsupported and skips connect when BLE is unavailable', () => {
    const deps = makeDeps({ isBluetoothSupported: false });
    const { result } = renderHook(() => useWallConfirmFallback(deps));

    act(() => {
      result.current.armWatcher(baseClimb);
    });

    act(() => {
      vi.advanceTimersByTime(WALL_CONFIRM_TIMEOUT_MS);
    });

    expect(deps.bluetoothConnect).not.toHaveBeenCalled();
    expect(mockTrack).toHaveBeenCalledWith(
      'Wall Confirm Timeout',
      expect.objectContaining({ fallback: 'unsupported' }),
    );
  });

  it('cancels the prior watcher when armWatcher is called again before timeout', () => {
    const deps = makeDeps();
    const { result } = renderHook(() => useWallConfirmFallback(deps));

    act(() => {
      result.current.armWatcher(baseClimb);
    });

    // Re-arm with a different climb halfway through the window.
    act(() => {
      vi.advanceTimersByTime(WALL_CONFIRM_TIMEOUT_MS / 2);
    });
    act(() => {
      result.current.armWatcher({ ...baseClimb, climbUuid: 'climb-2', frames: 'p2r13' });
    });

    // Original would have fired now — should be cancelled.
    act(() => {
      vi.advanceTimersByTime(WALL_CONFIRM_TIMEOUT_MS / 2 + 1);
    });
    expect(deps.bluetoothConnect).not.toHaveBeenCalled();

    // Second watcher's full window now elapses.
    act(() => {
      vi.advanceTimersByTime(WALL_CONFIRM_TIMEOUT_MS / 2);
    });
    expect(deps.bluetoothConnect).toHaveBeenCalledOnce();
    expect(deps.bluetoothConnect).toHaveBeenCalledWith('p2r13', false);
  });

  it('cleans up the watcher on unmount', () => {
    const deps = makeDeps();
    const { result, unmount } = renderHook(() => useWallConfirmFallback(deps));

    act(() => {
      result.current.armWatcher(baseClimb);
    });

    unmount();

    act(() => {
      vi.advanceTimersByTime(WALL_CONFIRM_TIMEOUT_MS + 100);
    });

    expect(deps.bluetoothConnect).not.toHaveBeenCalled();
    expect(mockTrack).not.toHaveBeenCalled();
  });
});
