'use client';

import { useCallback, useEffect, useRef } from 'react';
import { track } from '@/app/lib/analytics';
import { subscribeToWallConfirm } from '../board-bluetooth-control/wall-confirm-bus';
import { isNativeApp } from '@/app/lib/ble/capacitor-utils';

/**
 * How long the lightbulb waits for a `WallConfirmedClimb` after pressing
 * before running the connect fallback. 2 seconds is short enough that the
 * fallback feels responsive, long enough to cover a typical BLE write plus
 * a WS round-trip on a slow link.
 */
export const WALL_CONFIRM_TIMEOUT_MS = 2000;

export type WallConfirmFallback = 'auto_connect' | 'picker' | 'already_connected' | 'unsupported';

type ArmWatcherArgs = {
  climbUuid: string;
  frames: string;
  mirrored: boolean;
  /** 'party' or 'solo' — drives the analytics event property. */
  mode: 'party' | 'solo';
  /** Layout name for the analytics event property. */
  boardLayout: string;
};

type Watcher = { timeoutId: ReturnType<typeof setTimeout>; unsubscribe: () => void };

type Deps = {
  /** Current local BLE connection state. */
  isBluetoothConnected: boolean;
  /** Whether Web Bluetooth or a Capacitor BLE bridge is available. */
  isBluetoothSupported: boolean;
  /** Stored session board serial (party), or null in solo / unknown. */
  lastConnectedBoardSerial: string | null;
  /** BluetoothProvider's `connect` from `useBluetoothContext()`. */
  bluetoothConnect: (frames?: string, mirrored?: boolean, targetSerial?: string) => Promise<boolean>;
  /** Override for native-shell detection — defaults to `isNativeApp()` from
   *  `@/app/lib/ble/capacitor-utils`. Exposed so tests can drive the
   *  auto-connect branch without monkey-patching Capacitor. */
  isNativeAppOverride?: () => boolean;
};

/**
 * Arms a 2-second wall-confirm watcher. If a `WallConfirmedClimb` for
 * `climbUuid` arrives on the local bus inside the window, the timer is
 * dismissed; otherwise a fallback runs:
 *
 *  - Already BLE-connected → no-op; the AutoSender's write is in flight.
 *  - BLE supported + stored serial + native shell → auto-connect to the
 *    recorded board (skips picker).
 *  - BLE supported, no stored serial or web shell → kick off connect()
 *    which surfaces the device picker.
 *  - BLE unsupported → no-op (iOS Safari, etc).
 *
 * Returns an `armWatcher(climb)` callable and a cleanup function. The hook
 * also cleans up on unmount automatically.
 */
export function useWallConfirmFallback(deps: Deps) {
  const watcherRef = useRef<Watcher | null>(null);

  // Mirror deps into refs so a single stable `armWatcher` reads fresh values
  // without consumers having to memoize call sites carefully.
  const depsRef = useRef(deps);
  useEffect(() => {
    depsRef.current = deps;
  }, [deps]);

  const cancelWatcher = useCallback(() => {
    const watcher = watcherRef.current;
    if (!watcher) return;
    clearTimeout(watcher.timeoutId);
    watcher.unsubscribe();
    watcherRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      cancelWatcher();
    };
  }, [cancelWatcher]);

  const armWatcher = useCallback(
    ({ climbUuid, frames, mirrored, mode, boardLayout }: ArmWatcherArgs) => {
      // Cancel any previous watcher (user re-pressed before the 2s elapsed).
      cancelWatcher();

      const runFallback = () => {
        const d = depsRef.current;
        cancelWatcher();
        if (d.isBluetoothConnected) {
          track('Wall Confirm Timeout', { mode, fallback: 'already_connected', boardLayout });
          return;
        }
        if (!d.isBluetoothSupported) {
          track('Wall Confirm Timeout', { mode, fallback: 'unsupported', boardLayout });
          return;
        }
        const detectNative = d.isNativeAppOverride ?? isNativeApp;
        if (d.lastConnectedBoardSerial && detectNative()) {
          track('Wall Confirm Timeout', { mode, fallback: 'auto_connect', boardLayout });
          void d.bluetoothConnect(frames, mirrored, d.lastConnectedBoardSerial);
          return;
        }
        track('Wall Confirm Timeout', { mode, fallback: 'picker', boardLayout });
        void d.bluetoothConnect(frames, mirrored);
      };

      const unsubscribe = subscribeToWallConfirm((confirmedUuid) => {
        if (confirmedUuid !== climbUuid) return;
        cancelWatcher();
      });

      const timeoutId = setTimeout(runFallback, WALL_CONFIRM_TIMEOUT_MS);
      watcherRef.current = { timeoutId, unsubscribe };
    },
    [cancelWatcher],
  );

  return { armWatcher, cancelWatcher };
}
