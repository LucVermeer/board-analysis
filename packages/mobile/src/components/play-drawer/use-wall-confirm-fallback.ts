import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import {
  createWallConfirmFallbackController,
  subscribeToWallConfirm,
  WALL_CONFIRM_TIMEOUT_MS,
  type WallConfirmArmArgs,
} from '@boardsesh/play-view';
import { track } from '../../lib/analytics';

export { WALL_CONFIRM_TIMEOUT_MS };

type Deps = {
  sessionId: string | null;
  isBluetoothConnected: boolean;
  isBluetoothSupported: boolean;
  lastConnectedBoardSerial: string | null;
  isPersistentSessionActive: boolean;
  bluetoothConnect: (frames?: string, mirrored?: boolean, targetSerial?: string) => Promise<boolean>;
  isNativeAppOverride?: () => boolean;
};

type Callbacks = {
  onConfirmed?: (info: { climbUuid: string; latencyMs: number; confirmedByRole: 'self' | 'other' }) => void;
  onTimeout?: (info: { climbUuid: string }) => void;
};

export function useWallConfirmFallback(deps: Deps, callbacks: Callbacks = {}) {
  const latestDepsRef = useRef(deps);
  const callbacksRef = useRef(callbacks);
  const sessionIdRef = useRef(deps.sessionId);

  useLayoutEffect(() => {
    latestDepsRef.current = deps;
  }, [deps]);
  useLayoutEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);

  const controller = useMemo(
    () =>
      createWallConfirmFallbackController(
        {
          isBluetoothConnected: () => latestDepsRef.current.isBluetoothConnected,
          isBluetoothSupported: () => latestDepsRef.current.isBluetoothSupported,
          lastConnectedBoardSerial: () => latestDepsRef.current.lastConnectedBoardSerial,
          isPersistentSessionActive: () => latestDepsRef.current.isPersistentSessionActive,
          bluetoothConnect: (...args) => latestDepsRef.current.bluetoothConnect(...args),
          isNativeApp: () => (latestDepsRef.current.isNativeAppOverride ?? (() => true))(),
          subscribeToWallConfirm,
        },
        {
          onConfirmed: (info) => callbacksRef.current.onConfirmed?.(info),
          onTimeout: (info) => callbacksRef.current.onTimeout?.(info),
          onTrackConfirmed: ({ climbUuid, latencyMs, confirmedByRole, mode, boardLayout }) => {
            track('Wall Confirmed', { climbUuid, latencyMs, confirmedByRole, mode, boardLayout });
          },
          onTrackTimeout: ({ mode, fallback, boardLayout }) => {
            track('Wall Confirm Timeout', { mode, fallback, boardLayout });
          },
        },
      ),
    [],
  );

  const cancelWatcher = useCallback(() => {
    controller.cancelWatcher();
  }, [controller]);

  const armWatcher = useCallback(
    (args: WallConfirmArmArgs) => {
      controller.armWatcher(args);
    },
    [controller],
  );

  useEffect(() => {
    return () => {
      controller.cancelWatcher();
    };
  }, [controller]);

  useEffect(() => {
    controller.handleSessionActiveChange();
  }, [controller, deps.isPersistentSessionActive]);

  useEffect(() => {
    if (sessionIdRef.current === deps.sessionId) return;
    sessionIdRef.current = deps.sessionId;
    controller.cancelWatcher();
  }, [controller, deps.sessionId]);

  return { armWatcher, cancelWatcher };
}
