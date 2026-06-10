import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import {
  getAuroraBluetoothPacket,
  parseApiLevel,
  parseSerialNumber,
  type LedColorOverrides,
} from '@boardsesh/ble-protocol/aurora';
import { getMoonboardBluetoothPacket } from '@boardsesh/ble-protocol/moonboard';
import { isDisconnectionError } from '@boardsesh/ble-protocol/connection-error';
import { boardSupportsMirroring } from '@boardsesh/play-view';
import type { AuroraBoardName } from '@boardsesh/shared-schema';
import { SHARED_EVENTS } from '@boardsesh/analytics';
import { RECORD_BOARD_SERIAL } from '@boardsesh/graphql/operations';
import { getHttpClient } from '../graphql/client';
import { getAuthToken } from '../auth-store';
import { createBluetoothAdapter, isNativeIosBleAdapter } from './adapter-factory';
import { requestBleRuntimePermissions } from './use-ble-permissions';
import type { BluetoothAdapter, DevicePickerFn, DiscoveredDevice } from './types';
import type { HoldPlacement } from '../../components/board-renderer/types';
import { track } from '../analytics';

// Exported for testing — isolates the .packet extraction so regressions are caught.
//
// Returns:
//  - undefined when there are no frames (nothing to send)
//  - false when every placement was skipped (the packet builder still emits the
//    "clear all" packet `l##`, so writing it would silently dark the board while
//    the caller reported success). The caller surfaces the incompatible-climb
//    error instead of writing — web parity (use-board-bluetooth.ts:348-363).
//  - true after a successful write.
export async function dispatchMoonboardPacket(
  frames: string,
  write: BluetoothAdapter['write'],
  signal?: AbortSignal,
): Promise<boolean | undefined> {
  if (!frames) return undefined;
  const { packet, skippedRoleCount, skippedPositionCount, totalPlacements } = getMoonboardBluetoothPacket(frames);
  const skippedCount = skippedRoleCount + skippedPositionCount;
  if (totalPlacements > 0 && skippedCount === totalPlacements) {
    return false;
  }
  await write(packet, signal);
  return true;
}

export type PickerState = {
  devices: DiscoveredDevice[];
  isScanning: boolean;
  handleSelect: (deviceId: string) => void;
  handleCancel: () => void;
};

/**
 * Fire-and-forget GraphQL mutation recording the (serial, board config, API
 * level) seen on connect for the authenticated user. Mirrors the web app's
 * `recordBoardSerial`. Failures are swallowed — connect must not block on this.
 */
function recordBoardSerial(input: {
  serialNumber: string;
  boardName: string;
  layoutId: number;
  sizeId: number;
  setIds: string;
  apiLevel: number;
  boardUuid?: string;
}): void {
  // Canonicalise set IDs: dedupe + numeric sort, dropping any non-numeric token
  // so the value satisfies the backend's `^\d+(,\d+)*$` schema.
  const setIds = [
    ...new Set(
      input.setIds
        .split(',')
        .map((part) => part.trim())
        .filter((part) => /^\d+$/.test(part)),
    ),
  ]
    .sort((first, second) => Number(first) - Number(second))
    .join(',');
  if (!setIds) return;
  // The mutation requires auth, so firing it while signed out is a guaranteed
  // 401 round-trip on every anonymous connect. Skip when there's no stored
  // token. (Web threads a token through and fires regardless, but on mobile the
  // token lives in SecureStore, so a cheap async check here avoids the noise.)
  void getAuthToken().then((token) => {
    if (!token) return;
    return getHttpClient()
      .request(RECORD_BOARD_SERIAL, { input: { ...input, setIds } })
      .catch(() => {});
  });
}

type GetLedPlacementsFn = (boardName: string, layoutId: number, sizeId: number) => Record<number, number>;
let cachedGetLedPlacements: GetLedPlacementsFn | null = null;

export const convertToMirroredFramesString = (frames: string, holdsData: HoldPlacement[]): string => {
  const holdIdToMirroredIdMap = new Map<number, number>();
  for (const hold of holdsData) {
    if (hold.mirroredHoldId) {
      holdIdToMirroredIdMap.set(hold.id, hold.mirroredHoldId);
    }
  }

  return frames
    .split('p')
    .filter((hold) => hold)
    .map((holdEntry) => {
      const [holdId, stateCode] = holdEntry.split('r').map((str) => Number(str));
      const mirroredHoldId = holdIdToMirroredIdMap.get(holdId);

      if (mirroredHoldId === undefined) {
        throw new Error(`Mirrored hold ID is not defined for hold ID ${holdId}.`);
      }

      return `p${mirroredHoldId}r${stateCode}`;
    })
    .join('');
};

type UseBoardBluetoothOptions = {
  boardName?: string;
  layoutId?: number;
  sizeId?: number;
  /** Comma-separated set IDs of the active board, recorded against the serial on connect. */
  setIds?: string;
  /** UUID of the active (saved) board, linked to the serial recording. */
  boardUuid?: string;
  holdsData?: HoldPlacement[];
  ledColorOverrides?: LedColorOverrides;
  onConnectionChange?: (connected: boolean) => void;
  onConnectSuccess?: (serial: string | null) => void;
};

const KEEP_AWAKE_TAG = 'boardsesh-ble';

/**
 * Create a single AbortSignal that fires when either of the two input signals
 * is aborted. This lets us combine a caller-supplied signal with an internal
 * one without losing either.
 *
 * Returns the merged `signal` plus a `dispose()` that detaches the abort
 * listeners from both inputs. The caller MUST call `dispose()` once the write
 * settles (success or failure), via a `finally`. Without it, a write that never
 * aborts (the common case) would leave the `onAbort` listener permanently
 * parked on the caller's long-lived signal — the AutoSender hands its single
 * lifetime signal to every send, so the listeners (and the per-write
 * controllers they retain) accumulate for the life of the connection.
 *
 * Exported for testing the listener lifecycle.
 */
export function mergeAbortSignals(
  signalA: AbortSignal,
  signalB: AbortSignal,
): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController();

  if (signalA.aborted || signalB.aborted) {
    controller.abort();
    // Nothing was attached; dispose is a safe no-op on the early-aborted path.
    return { signal: controller.signal, dispose: () => {} };
  }

  const onAbort = () => {
    controller.abort();
  };

  const dispose = () => {
    signalA.removeEventListener('abort', onAbort);
    signalB.removeEventListener('abort', onAbort);
  };

  signalA.addEventListener('abort', onAbort);
  signalB.addEventListener('abort', onAbort);

  return { signal: controller.signal, dispose };
}

function classifyBleFailureReason(error: unknown): string {
  if (isDisconnectionError(error)) return 'disconnected';
  if (error instanceof Error && error.message.includes('Mirrored hold ID')) return 'missing_mirror_mapping';
  if (error instanceof DOMException) return `dom_${error.name || 'exception'}`;
  return 'write_failed';
}

export function useBoardBluetooth({
  boardName,
  layoutId,
  sizeId,
  setIds,
  boardUuid,
  holdsData,
  ledColorOverrides,
  onConnectionChange,
  onConnectSuccess,
}: UseBoardBluetoothOptions) {
  const { t } = useTranslation('settings');
  const [loading, setLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  // Remember the board (serial + which config it was paired against) so a later
  // involuntary drop can be recovered with a silent reconnect to the same board
  // (the lightbulb tap, native shells). Only valid while the current route still
  // points at the same board — switching board/layout/size invalidates it and
  // callers fall back to the picker. Mirrors the web `reconnectSerialForCurrentBoard`.
  const [lastConnectedBoard, setLastConnectedBoard] = useState<{ serial: string; configKey: string } | null>(null);

  const adapterRef = useRef<BluetoothAdapter | null>(null);
  const apiLevelRef = useRef<number>(3);
  const unsubDisconnectRef = useRef<(() => void) | null>(null);
  const writeAbortRef = useRef<AbortController | null>(null);
  // Synchronous in-flight latch for connect(). The lightbulb button isn't
  // disabled while a connect is pending (isScanning only drives a pulse), so a
  // double-tap can re-enter connect(); without this, the second attempt creates
  // a second adapter and starts a second scan on the shared BleManager
  // singleton, and each flow's stopDeviceScan kills the other's scan.
  const isConnectingRef = useRef(false);

  const [pickerState, setPickerState] = useState<PickerState | null>(null);
  const pickerRejectRef = useRef<((error: Error) => void) | null>(null);

  // Keep the screen awake while connected to a board
  useEffect(() => {
    if (isConnected) {
      activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    } else {
      deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
    }
    return () => {
      deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
    };
  }, [isConnected]);

  const devicePicker = useCallback<DevicePickerFn>((subscribe) => {
    return new Promise<string>((resolve, reject) => {
      pickerRejectRef.current = reject;

      const cleanup = () => {
        pickerRejectRef.current = null;
        setPickerState(null);
      };

      const handleSelect = (deviceId: string) => {
        cleanup();
        resolve(deviceId);
      };

      const handleCancel = () => {
        cleanup();
        reject(new Error('Device selection cancelled'));
      };

      setPickerState({ devices: [], isScanning: true, handleSelect, handleCancel });

      subscribe(
        (devices) => {
          setPickerState((prev) => (prev ? { ...prev, devices } : null));
        },
        () => {
          // Scan window closed — drop the spinner. The picker stays open (a
          // device was found but not yet picked, or it shows the empty state).
          setPickerState((prev) => (prev ? { ...prev, isScanning: false } : null));
        },
      );
    });
  }, []);

  const handleDisconnection = useCallback(() => {
    setIsConnected(false);
    onConnectionChange?.(false);
  }, [onConnectionChange]);

  const sendFramesToBoard = useCallback(
    async (frames: string, mirrored: boolean = false, signal?: AbortSignal) => {
      if (!adapterRef.current || !boardName || layoutId === undefined || sizeId === undefined) return;
      const boardAnalyticsProperties = { boardName, layoutId, sizeId, mirrored };

      // Create an AbortController for this write so connect() can cancel
      // an in-flight write when creating a new adapter.
      const writeAbort = new AbortController();
      writeAbortRef.current = writeAbort;

      // Combine caller-provided signal with the internal abort controller. The
      // merge attaches abort listeners to both inputs; `disposeMergedSignal`
      // detaches them once the write settles so a non-aborting write doesn't
      // leak a listener on the AutoSender's long-lived signal.
      let combinedSignal = writeAbort.signal;
      let disposeMergedSignal: (() => void) | undefined;
      if (signal) {
        const merged = mergeAbortSignals(signal, writeAbort.signal);
        combinedSignal = merged.signal;
        disposeMergedSignal = merged.dispose;
      }

      try {
        if (boardName === 'moonboard') {
          const sent = await dispatchMoonboardPacket(
            frames,
            adapterRef.current.write.bind(adapterRef.current),
            combinedSignal,
          );
          // false = every placement was skipped (unrecognised/corrupt hold
          // data). The packet builder would emit a "clear all" packet, darking
          // the board, so dispatchMoonboardPacket refuses to write. Surface the
          // same incompatible-climb error the Aurora branch uses instead of
          // letting the AutoSender buzz success on a dark board.
          if (sent === false) {
            console.warn('[BLE] All MoonBoard placements skipped — climb has unrecognised hold data');
            Alert.alert(t('ble.notAvailable'), t('ble.errorIncompatible'));
            track(SHARED_EVENTS.ClimbSentToBoardFailure, {
              ...boardAnalyticsProperties,
              failureReason: 'incompatible_climb',
            });
            return false;
          }
          if (sent) track(SHARED_EVENTS.ClimbSentToBoardSuccess, boardAnalyticsProperties);
          return sent;
        }

        // Empty frames = "clear all LEDs" for Aurora boards
        if (frames === '') {
          const clearResult = getAuroraBluetoothPacket('', {}, boardName as AuroraBoardName, apiLevelRef.current);
          await adapterRef.current.write(clearResult.packet, combinedSignal);
          return true;
        }

        let framesToSend = frames;

        if (mirrored && boardSupportsMirroring(boardName, layoutId)) {
          // On a board that supports mirroring, a mirrored send REQUIRES the
          // hold map to produce mirrored frames. If it's missing/empty we must
          // refuse rather than send the original (un-mirrored) frames — that
          // would light the wrong holds on the wall while the AutoSender buzzed
          // success. Web parity (use-board-bluetooth.ts:397-403).
          if (!holdsData || holdsData.length === 0) {
            console.error(
              `[BLE] Cannot mirror frames: holdsData is missing or empty for ${boardName} layout=${layoutId}`,
            );
            Alert.alert(t('ble.notAvailable'), t('ble.errorIncompatible'));
            track(SHARED_EVENTS.ClimbSentToBoardFailure, {
              ...boardAnalyticsProperties,
              failureReason: 'missing_mirror_data',
            });
            return false;
          }
          framesToSend = convertToMirroredFramesString(frames, holdsData);
        }

        if (!cachedGetLedPlacements) {
          const mod = await import('@boardsesh/board-constants/led-placements');
          cachedGetLedPlacements = mod.getLedPlacements as GetLedPlacementsFn;
        }
        const getLedPlacementsFn = cachedGetLedPlacements;
        const placementPositions = getLedPlacementsFn(boardName, layoutId, sizeId);

        if (Object.keys(placementPositions).length === 0) {
          console.error(
            `[BLE] LED placement map is empty for ${boardName} layout=${layoutId} size=${sizeId}. Board configuration may be incorrect or LED data may need regeneration.`,
          );
          Alert.alert(t('ble.notAvailable'), t('ble.errorLedMissing'));
          track(SHARED_EVENTS.ClimbSentToBoardFailure, {
            ...boardAnalyticsProperties,
            failureReason: 'missing_led_placements',
          });
          return false;
        }

        const result = getAuroraBluetoothPacket(
          framesToSend,
          placementPositions,
          boardName as AuroraBoardName,
          apiLevelRef.current,
          ledColorOverrides,
        );

        const skippedCount = result.skippedPositionCount + result.skippedRoleCount;

        if (skippedCount > 0 && result.packet.length === 0) {
          console.warn(`[BLE] All ${result.totalPlacements} placements skipped — climb incompatible with board`);
          Alert.alert(t('ble.notAvailable'), t('ble.errorIncompatible'));
          track(SHARED_EVENTS.ClimbSentToBoardFailure, {
            ...boardAnalyticsProperties,
            failureReason: 'incompatible_climb',
          });
          return false;
        }

        if (skippedCount > 0) {
          console.warn(`[BLE] ${skippedCount} of ${result.totalPlacements} placements skipped`);
        }

        await adapterRef.current.write(result.packet, combinedSignal);
        track(SHARED_EVENTS.ClimbSentToBoardSuccess, boardAnalyticsProperties);
        return true;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        console.error('Error sending frames to board:', error);
        track(SHARED_EVENTS.ClimbSentToBoardFailure, {
          ...boardAnalyticsProperties,
          failureReason: classifyBleFailureReason(error),
        });
        // A write that fails because the link is gone (the board dropped or
        // another device grabbed it — these boards are last-connection-wins) is
        // often the only signal we get: the adapter's disconnect event may never
        // fire. Mark the connection lost so the lightbulb stops showing
        // "connected" and a deliberate reconnect can run. The native adapters
        // throw the plain-Error signatures the predicate matches ("Not
        // connected", "Device disconnected during write").
        if (isDisconnectionError(error)) {
          // The tug-of-war signal: we believed we were connected but a write just
          // failed on a dead link. On a shared board this is usually another
          // device having grabbed it. Recorded so the two-climber case is visible.
          track(SHARED_EVENTS.BluetoothConnectionStolen, { boardName, layoutId, sizeId });
          handleDisconnection();
        }
        return false;
      } finally {
        // Detach the merged-signal listeners now the write has settled. Without
        // this, a non-aborting write leaves a listener parked on the caller's
        // long-lived signal (the AutoSender's lifetime signal), retaining the
        // per-write AbortController for the connection.
        disposeMergedSignal?.();
      }
    },
    [boardName, layoutId, sizeId, holdsData, ledColorOverrides, handleDisconnection],
  );

  const connect = useCallback(
    async (initialFrames?: string, mirrored?: boolean, targetSerial?: string) => {
      if (!boardName) {
        console.error('Cannot connect to Bluetooth without board name');
        return false;
      }

      // Drop a re-entrant connect (lightbulb double-tap) — the first attempt
      // owns the shared BleManager scan for its lifetime. Set synchronously
      // before any await so two back-to-back calls can't both pass.
      if (isConnectingRef.current) {
        return false;
      }
      isConnectingRef.current = true;

      setLoading(true);

      try {
        const permissionsGranted = await requestBleRuntimePermissions({ requestNotificationPermission: true });
        if (!permissionsGranted) {
          Alert.alert(t('ble.permissionRequired'), t('ble.errorPermissionDenied'));
          return false;
        }

        const adapter = createBluetoothAdapter(devicePicker);

        const available = await adapter.isAvailable();
        if (!available) {
          Alert.alert(t('ble.notAvailable'), t('ble.notAvailable'));
          return false;
        }

        // Abort any in-flight write from the previous adapter so it
        // doesn't keep writing on a potentially-disconnected device.
        writeAbortRef.current?.abort();
        writeAbortRef.current = null;

        // Clean up any existing adapter
        if (adapterRef.current) {
          unsubDisconnectRef.current?.();
          try {
            await adapterRef.current.disconnect();
          } catch {
            // The previous adapter may already be torn down — e.g. after a
            // write-failure disconnect (another device grabbed the board) the
            // link is dead, and disconnecting a dead handle can reject. We're
            // replacing it anyway, so swallow it rather than aborting the
            // reconnect with a spurious error.
          }
        }

        // Surface the scan on the session-recording timeline / PostHog. `reconnect`
        // distinguishes a deliberate same-board serial reconnect (lightbulb) from a
        // fresh picker-driven connect.
        track(SHARED_EVENTS.BluetoothScanStarted, { boardName, layoutId, sizeId, reconnect: !!targetSerial });

        const connection = await adapter.requestAndConnect(targetSerial);
        apiLevelRef.current = parseApiLevel(connection.deviceName);

        unsubDisconnectRef.current = adapter.onDisconnect(handleDisconnection);
        adapterRef.current = adapter;

        // Push board configuration into the native BoardBleManager so the
        // Dynamic Island widget intent path (next/prev tapped while the app
        // is backgrounded) can encode wall packets from queue items stored in
        // the App Group without going through JS. No-op on Android.
        if (isNativeIosBleAdapter(adapter) && layoutId !== undefined && sizeId !== undefined) {
          try {
            await adapter.configureBoard({
              boardName,
              layoutId,
              sizeId,
              apiLevel: apiLevelRef.current,
              deviceName: connection.deviceName,
              colorOverrides: ledColorOverrides
                ? Object.fromEntries(
                    Object.entries(ledColorOverrides).filter(([, value]) => typeof value === 'string') as [
                      string,
                      string,
                    ][],
                  )
                : undefined,
            });
          } catch (error) {
            console.warn('[BLE] Failed to push board configuration to native side:', error);
          }
        }

        // Parse serial for Aurora boards and record the (serial, config, API
        // level) mapping for serial→config lookups. Moonboard device names
        // don't carry a serial in this format, so they're skipped.
        let parsedSerial: string | null = null;
        if (boardName !== 'moonboard' && connection.deviceName) {
          parsedSerial = parseSerialNumber(connection.deviceName) ?? null;
          if (parsedSerial && boardName && layoutId !== undefined && sizeId !== undefined && setIds) {
            recordBoardSerial({
              serialNumber: parsedSerial,
              boardName,
              layoutId,
              sizeId,
              setIds,
              apiLevel: apiLevelRef.current,
              boardUuid,
            });
          }
        }

        // Remember the board (keyed to the config it was paired against) so an
        // involuntary drop can be recovered with a silent reconnect. Only Aurora
        // boards expose a parseable serial; moonboard can't be reconnected by serial.
        if (parsedSerial) {
          setLastConnectedBoard({ serial: parsedSerial, configKey: `${boardName}::${layoutId}::${sizeId}` });
        }

        // Send initial frames if provided
        if (initialFrames) {
          await sendFramesToBoard(initialFrames, mirrored);
        }

        setIsConnected(true);
        onConnectionChange?.(true);
        onConnectSuccess?.(parsedSerial);
        // apiLevel is the level parseApiLevel actually picked; deviceNamePresent
        // records whether an advertised name was even available. parseApiLevel
        // silently defaults to v2 when the name is missing/unparseable, and v2
        // encoding drops LED positions > 1023 — so a v3 board connecting with no
        // advertised name would light only part of the wall. These two props let
        // us see in PostHog whether that fallback ever fires in the wild.
        track(SHARED_EVENTS.BluetoothConnectionSuccess, {
          boardName,
          layoutId,
          sizeId,
          apiLevel: apiLevelRef.current,
          deviceNamePresent: !!connection.deviceName,
        });
        return true;
      } catch (error) {
        console.error('Error connecting to Bluetooth:', error);
        setIsConnected(false);

        // Dismiss the picker sheet if it's still showing. When a reconnect-by-
        // serial grace window opens the picker but nothing ever advertises, the
        // adapter rejects the selection promise on the scan timeout without
        // settling the picker's own promise — so the sheet (and its spinner)
        // would otherwise stay mounted until the user swipes it away. Settle the
        // dangling picker promise before clearing it (matching the unmount
        // cleanup) so it can't leak.
        pickerRejectRef.current?.(new Error('Connection failed'));
        pickerRejectRef.current = null;
        setPickerState(null);

        const errorMessage = error instanceof Error ? error.message : String(error);
        const isUserCancel =
          /user cancelled|cancel/i.test(errorMessage) || /Device selection cancelled/i.test(errorMessage);

        if (!isUserCancel) {
          Alert.alert(t('ble.notAvailable'), t('ble.errorConnectionFailed'));
        }

        track(SHARED_EVENTS.BluetoothConnectionFailed, {
          boardName,
          layoutId,
          sizeId,
          failureReason: classifyBleFailureReason(error),
        });
      } finally {
        setLoading(false);
        isConnectingRef.current = false;
      }

      return false;
    },
    [
      handleDisconnection,
      boardName,
      layoutId,
      sizeId,
      setIds,
      boardUuid,
      onConnectionChange,
      onConnectSuccess,
      sendFramesToBoard,
      devicePicker,
    ],
  );

  const disconnect = useCallback(async () => {
    unsubDisconnectRef.current?.();
    unsubDisconnectRef.current = null;
    const adapter = adapterRef.current;
    adapterRef.current = null;
    setIsConnected(false);
    // A deliberate disconnect clears the remembered board — only an involuntary
    // drop should offer a silent same-board reconnect.
    setLastConnectedBoard(null);
    onConnectionChange?.(false);
    await adapter?.disconnect();
  }, [onConnectionChange]);

  // Serial to silently reconnect to for the board currently in view, or null
  // when nothing is remembered or the user switched boards (in which case the
  // caller opens the device picker instead).
  //
  // Deliberately keyed on board+layout+size only — NOT set_ids, which web's
  // boardIdentityKey also folds in. The mobile BluetoothProvider is handed a
  // single global activeBoard (no set_ids), and the LED placement map keys on
  // layout+size alone, so a same-board reconnect renders identically regardless
  // of set_ids. Don't thread set_ids in here without also passing it to the
  // provider.
  const currentConfigKey =
    boardName && layoutId !== undefined && sizeId !== undefined ? `${boardName}::${layoutId}::${sizeId}` : null;
  const reconnectSerialForCurrentBoard =
    lastConnectedBoard && currentConfigKey && lastConnectedBoard.configKey === currentConfigKey
      ? lastConnectedBoard.serial
      : null;

  // Clean up on unmount
  useEffect(() => {
    return () => {
      pickerRejectRef.current?.(new Error('Component unmounted'));
      pickerRejectRef.current = null;
      unsubDisconnectRef.current?.();
      void adapterRef.current?.disconnect();
    };
  }, []);

  return {
    isConnected,
    loading,
    connect,
    disconnect,
    sendFramesToBoard,
    pickerState,
    reconnectSerialForCurrentBoard,
  };
}
