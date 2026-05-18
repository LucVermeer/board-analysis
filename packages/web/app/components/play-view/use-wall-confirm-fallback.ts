'use client';

import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
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

/**
 * Event-name policy.
 *
 *   - `Wall Confirmed` — fires on the success branch (confirm-before-expiry).
 *     Properties: `climbUuid`, `latencyMs`, `confirmedByRole`, `mode`,
 *     `boardLayout`.
 *   - `Wall Confirm Timeout` — fires on the failure branch (timer fired,
 *     watcher ran a fallback). Properties: `mode`, `fallback`, `boardLayout`.
 *
 * The pivot spec (Phase 5) names the success event `Wall Confirmed`. We keep
 * the timeout under its own name (`Wall Confirm Timeout`) rather than reusing
 * `Wall Confirmed` with a discriminator so the two time series remain
 * trivially separable in PostHog dashboards (the kill-switch counter-metric
 * — share of takes not followed by a `Wall Confirmed` within 2s — reads each
 * event by name).
 */

type ArmWatcherArgs = {
  climbUuid: string;
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
  /** Whether a persistent party session is active. When the session ends
   *  mid-window, the in-flight watcher should cancel silently so the picker
   *  doesn't pop up after the user already left. */
  isPersistentSessionActive: boolean;
  /** BluetoothProvider's `connect` from `useBluetoothContext()`. */
  bluetoothConnect: (frames?: string, mirrored?: boolean, targetSerial?: string) => Promise<boolean>;
  /** Override for native-shell detection — defaults to `isNativeApp()` from
   *  `@/app/lib/ble/capacitor-utils`. Exposed so tests can drive the
   *  auto-connect branch without monkey-patching Capacitor. */
  isNativeAppOverride?: () => boolean;
};

type Callbacks = {
  /** Fired when a `WallConfirmedClimb` matching the armed `climbUuid` arrives
   *  inside the 2-second window. Receives the elapsed `latencyMs` and a
   *  `confirmedByRole` hint derived from the local BLE state at confirm time
   *  (`'self'` when the local phone is currently BLE-paired — most likely the
   *  AutoSender that just wrote; `'other'` otherwise). The drawer uses this
   *  to fire the `Wall Confirmed` analytics event and clear pending UI. */
  onConfirmed?: (info: { climbUuid: string; latencyMs: number; confirmedByRole: 'self' | 'other' }) => void;
  /** Fired when the 2-second window expires and a fallback ran. */
  onTimeout?: (info: { climbUuid: string }) => void;
};

/**
 * Arms a 2-second wall-confirm watcher. If a `WallConfirmedClimb` for
 * `climbUuid` arrives on the local bus inside the window, the timer is
 * dismissed and `onConfirmed` is invoked; otherwise a fallback runs:
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
 *
 * Race notes:
 *  - Deps are mirrored into per-field refs updated in a `useLayoutEffect`
 *    so timer / subscriber callbacks always read current values (not the
 *    values committed when the watcher was armed).
 *  - Re-arming captures a fresh `timeoutId`; the timer / subscriber bail at
 *    the top if `watcherRef.current?.timeoutId !== capturedTimeoutId` so a
 *    stale fire from a torn-down watcher can never tear down its successor.
 */
export function useWallConfirmFallback(deps: Deps, callbacks: Callbacks = {}) {
  const watcherRef = useRef<Watcher | null>(null);

  // Per-field refs so timer / subscriber callbacks always read fresh values.
  // `useLayoutEffect` keeps the refs in sync before any committed timer or
  // subscriber can read them (matters when a watcher is armed in the same
  // render the deps changed in).
  const isBluetoothConnectedRef = useRef(deps.isBluetoothConnected);
  const isBluetoothSupportedRef = useRef(deps.isBluetoothSupported);
  const lastConnectedBoardSerialRef = useRef(deps.lastConnectedBoardSerial);
  const isPersistentSessionActiveRef = useRef(deps.isPersistentSessionActive);
  const bluetoothConnectRef = useRef(deps.bluetoothConnect);
  const isNativeAppOverrideRef = useRef(deps.isNativeAppOverride);

  useLayoutEffect(() => {
    isBluetoothConnectedRef.current = deps.isBluetoothConnected;
  }, [deps.isBluetoothConnected]);
  useLayoutEffect(() => {
    isBluetoothSupportedRef.current = deps.isBluetoothSupported;
  }, [deps.isBluetoothSupported]);
  useLayoutEffect(() => {
    lastConnectedBoardSerialRef.current = deps.lastConnectedBoardSerial;
  }, [deps.lastConnectedBoardSerial]);
  useLayoutEffect(() => {
    isPersistentSessionActiveRef.current = deps.isPersistentSessionActive;
  }, [deps.isPersistentSessionActive]);
  useLayoutEffect(() => {
    bluetoothConnectRef.current = deps.bluetoothConnect;
  }, [deps.bluetoothConnect]);
  useLayoutEffect(() => {
    isNativeAppOverrideRef.current = deps.isNativeAppOverride;
  }, [deps.isNativeAppOverride]);

  const onConfirmedRef = useRef(callbacks.onConfirmed);
  const onTimeoutRef = useRef(callbacks.onTimeout);
  useLayoutEffect(() => {
    onConfirmedRef.current = callbacks.onConfirmed;
  }, [callbacks.onConfirmed]);
  useLayoutEffect(() => {
    onTimeoutRef.current = callbacks.onTimeout;
  }, [callbacks.onTimeout]);

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

  // Session-swap guard: if `isPersistentSessionActive` flips to false while a
  // watcher is armed, cancel silently. A picker popping up after the user
  // already left the session would be confusing and racy.
  useEffect(() => {
    if (!deps.isPersistentSessionActive && watcherRef.current) {
      cancelWatcher();
    }
  }, [deps.isPersistentSessionActive, cancelWatcher]);

  const armWatcher = useCallback(
    ({ climbUuid, mode, boardLayout }: ArmWatcherArgs) => {
      // Cancel any previous watcher (user re-pressed before the 2s elapsed).
      cancelWatcher();

      const armedAt = Date.now();
      let capturedTimeoutId: ReturnType<typeof setTimeout> | null = null;

      const runFallback = () => {
        // Stale-fire guard: a previous timeout that should have been cancelled
        // could still execute if the re-arm raced JS task scheduling. Bail if
        // the active watcher's id no longer matches the one we captured.
        if (watcherRef.current?.timeoutId !== capturedTimeoutId) return;

        cancelWatcher();
        onTimeoutRef.current?.({ climbUuid });

        if (isBluetoothConnectedRef.current) {
          track('Wall Confirm Timeout', { mode, fallback: 'already_connected', boardLayout });
          return;
        }
        if (!isBluetoothSupportedRef.current) {
          track('Wall Confirm Timeout', { mode, fallback: 'unsupported', boardLayout });
          return;
        }
        // Do NOT pass `frames`/`mirrored` to `connect()` — the underlying
        // hook writes them synchronously inside connect() and then flips
        // `isConnected`, which mounts `BluetoothAutoSender`, whose mount-time
        // effect immediately fires another write for the same climb. The
        // two back-to-back writes trigger Android's "GATT operation already
        // in progress". `takeControl()` already set the climb on
        // `currentClimbQueueItem`, so the AutoSender will send it on its
        // own as soon as the connect resolves.
        const detectNative = isNativeAppOverrideRef.current ?? isNativeApp;
        if (lastConnectedBoardSerialRef.current && detectNative()) {
          track('Wall Confirm Timeout', { mode, fallback: 'auto_connect', boardLayout });
          void bluetoothConnectRef.current(undefined, undefined, lastConnectedBoardSerialRef.current);
          return;
        }
        track('Wall Confirm Timeout', { mode, fallback: 'picker', boardLayout });
        void bluetoothConnectRef.current();
      };

      const unsubscribe = subscribeToWallConfirm((confirmedUuid) => {
        // Stale-subscriber guard: if a previous (cancelled) watcher's
        // subscriber callback is still queued and a later watcher is armed,
        // only the active watcher should handle the confirm.
        if (watcherRef.current?.timeoutId !== capturedTimeoutId) return;
        if (confirmedUuid !== climbUuid) return;
        const latencyMs = Date.now() - armedAt;
        const confirmedByRole: 'self' | 'other' = isBluetoothConnectedRef.current ? 'self' : 'other';
        cancelWatcher();
        onConfirmedRef.current?.({ climbUuid, latencyMs, confirmedByRole });
        track('Wall Confirmed', { climbUuid, latencyMs, confirmedByRole, mode, boardLayout });
      });

      capturedTimeoutId = setTimeout(runFallback, WALL_CONFIRM_TIMEOUT_MS);
      watcherRef.current = { timeoutId: capturedTimeoutId, unsubscribe };
    },
    [cancelWatcher],
  );

  return { armWatcher, cancelWatcher };
}
