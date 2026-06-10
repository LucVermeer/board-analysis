import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { ClimbQueueItem } from '@boardsesh/queue';
import type { BoardName, UserBoard } from '@boardsesh/shared-schema';
import { formatBoardDisplayName, toBoardName } from '@boardsesh/board-config';
import { SHARED_EVENTS } from '@boardsesh/analytics';
import { emitWallConfirm } from '@boardsesh/play-view';
import { useBoardBluetooth, boardConfigKey } from '../lib/ble/use-board-bluetooth';
import { useResolvedBleDeviceBoards } from '../lib/ble/resolve-serials';
import {
  decideBlePickerSelection,
  type BleBoardConfig,
  type PickerSelectionDecision,
} from '../lib/ble/board-config-match';
import { summarizePickerResolution, type PickerResolutionStats } from '../lib/ble/picker-resolution-stats';
import { useSetActiveBoard } from '../lib/graphql/use-active-board';
import type { GetBoardQueryResponse } from '../lib/graphql/operations';
import { getBoardRenderData } from '../lib/board-details';
import { registerBluetoothConnection } from '../lib/ble/bluetooth-status-store';
import { useQueue, useQueueSessionControls } from './queue-provider';
import { hapticSuccess } from '../lib/haptics';
import { DevicePickerSheet } from '../components/ble/DevicePickerSheet';
import { track } from '../lib/analytics';

type BluetoothContextValue = {
  isConnected: boolean;
  loading: boolean;
  connect: (initialFrames?: string, mirrored?: boolean, targetSerial?: string) => Promise<boolean>;
  disconnect: () => Promise<void>;
  sendFramesToBoard: (frames: string, mirrored?: boolean, signal?: AbortSignal) => Promise<boolean | undefined>;
  clearBoard: () => Promise<boolean | undefined>;
  /**
   * Force the auto-sender to re-push the current climb to the wall once, even
   * when the rendered pixels are byte-identical to the last send (which it
   * normally dedups). The lightbulb tap calls this so re-taking control of an
   * unchanged climb re-lights the wall — and, if the link is secretly dead, the
   * failing write trips disconnect detection. No-op until called.
   */
  reassertWall: () => void;
  /**
   * Serial to silently reconnect to for the board currently in view, or null
   * when nothing is remembered or the user switched boards — in which case
   * callers open the device picker instead.
   */
  reconnectSerialForCurrentBoard: string | null;
};

const BluetoothContext = createContext<BluetoothContextValue | null>(null);
const EMPTY_PICKER_DEVICES: [] = [];
// How long a switch-to-config auto-connect request stays armed waiting for the
// switched board's props to reach this provider before it is dropped.
const PENDING_AUTO_CONNECT_TTL_MS = 15_000;

function formatPickerBoardConfig(t: TFunction<'settings'>, config: BleBoardConfig): string {
  return t('boardConfigMismatch.mobileConfigValue', {
    board: formatBoardDisplayName(config.boardName),
    layoutId: config.layoutId,
    sizeId: config.sizeId,
    setIds: config.setIds,
  });
}

/**
 * Isolated child component that subscribes to the queue's currentClimbQueueItem
 * and auto-sends climb data over BLE. Only mounted when isConnected is true so
 * the BluetoothProvider itself never subscribes to the climb context, preventing
 * re-renders of the entire component tree on every climb change when BT is
 * disconnected.
 *
 * Uses a latest-wins drain loop for writes:
 * - `isWritingRef` tracks if a write is in progress
 * - `pendingClimbRef` stores the most recent pending climb
 * - When a new climb arrives during a write, it replaces the pending climb
 * - When the current write completes, the drain loop picks up whatever's pending
 * - Deduplicates byte-identical broadcasts via `lastSentSignatureRef` (keyed on
 *   uuid + frames + mirror, so a mirror toggle or hold edit on the same climb
 *   re-pushes), and a `reassertNonce` bump punches through the dedup once.
 */
function BluetoothAutoSender({
  sendFramesToBoard,
  onWallConfirmed,
  reassertNonce,
}: {
  sendFramesToBoard: (frames: string, mirrored?: boolean, signal?: AbortSignal) => Promise<boolean | undefined>;
  onWallConfirmed: (climbUuid: string) => void;
  reassertNonce: number;
}) {
  const { state } = useQueue();
  const { currentClimbQueueItem } = state;
  const onWallConfirmedRef = useRef(onWallConfirmed);
  useEffect(() => {
    onWallConfirmedRef.current = onWallConfirmed;
  }, [onWallConfirmed]);

  const isWritingRef = useRef(false);
  const pendingClimbRef = useRef<ClimbQueueItem | null>(null);
  // The signature of the last climb actually pushed to the wall: uuid + rendered
  // frames + mirror state. Re-broadcasts with the same signature skip the
  // physical write (the board is idempotent, but we'd double-fire haptics);
  // changing any of the three re-pushes.
  const lastSentSignatureRef = useRef<string | null>(null);
  // Last `reassertNonce` acted on. When the incoming nonce differs, a one-shot
  // re-push is requested so the current climb re-fires even if unchanged.
  const lastReassertNonceRef = useRef(reassertNonce);
  // Set when a reassert is requested, consumed inside the drain loop. A ref
  // (not just clearing the signature in the effect) so a reassert landing
  // *during* an in-flight write survives: the completing write re-sets the
  // signature, and clearing it again at the top of the next loop iteration is
  // what actually forces the re-push.
  const reassertPendingRef = useRef(false);

  // Single AbortController scoped to the AutoSender's lifetime. Aborted
  // exactly once on unmount so the in-flight drain loop cancels the
  // underlying adapter.write and returns before firing post-send side
  // effects for a climb the user has navigated away from.
  const abortControllerRef = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    abortControllerRef.current = controller;
    return () => {
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (!currentClimbQueueItem) return;
    const signal = abortControllerRef.current?.signal;
    if (signal?.aborted) return;

    // A reassert request (lightbulb re-take) forces a fresh write of the current
    // climb even when the pixels are byte-identical. Flag it; the drain loop
    // clears the dedup signature when it picks the climb up, which also covers
    // a reassert that lands while a write is already in flight.
    if (reassertNonce !== lastReassertNonceRef.current) {
      lastReassertNonceRef.current = reassertNonce;
      reassertPendingRef.current = true;
    }

    if (isWritingRef.current) {
      pendingClimbRef.current = currentClimbQueueItem;
      return;
    }

    isWritingRef.current = true;

    const drain = async () => {
      let toSend: ClimbQueueItem | null = currentClimbQueueItem;
      try {
        while (toSend) {
          if (signal?.aborted) return;
          const item = toSend;

          // Honour a pending reassert exactly when the climb is picked up —
          // clearing the signature here (rather than in the effect) survives an
          // in-flight write that re-set it on completion.
          if (reassertPendingRef.current) {
            reassertPendingRef.current = false;
            lastSentSignatureRef.current = null;
          }

          // Deduplicate byte-identical re-broadcasts (same climb, frames and
          // mirror). The board is idempotent so a re-send is functionally fine,
          // but we'd double-fire haptics. A mirror toggle or hold edit changes
          // the signature and re-pushes.
          const sendSignature = `${item.climb.uuid}::${item.climb.frames}::${item.climb.mirrored ? 1 : 0}`;
          if (sendSignature === lastSentSignatureRef.current) {
            onWallConfirmedRef.current(item.climb.uuid);
            toSend = pendingClimbRef.current;
            pendingClimbRef.current = null;
            continue;
          }

          try {
            const result = await sendFramesToBoard(item.climb.frames, !!item.climb.mirrored, signal);

            // After the await, the AutoSender may have unmounted — skip
            // post-send side effects.
            if (signal?.aborted) return;

            if (result === true) {
              lastSentSignatureRef.current = sendSignature;
              onWallConfirmedRef.current(item.climb.uuid);
              hapticSuccess();
            }
          } catch (error) {
            if (signal?.aborted) return;
            console.error('Error sending climb to board:', error);
          }

          toSend = pendingClimbRef.current;
          pendingClimbRef.current = null;
        }
      } finally {
        isWritingRef.current = false;
      }
    };

    void drain();
  }, [currentClimbQueueItem, sendFramesToBoard, reassertNonce]);

  return null;
}

type BluetoothProviderProps = {
  boardName?: string;
  layoutId?: number;
  sizeId?: number;
  setIds?: string;
  boardUuid?: string;
  children: React.ReactNode;
};

export function BluetoothProvider({
  boardName,
  layoutId,
  sizeId,
  setIds,
  boardUuid,
  children,
}: BluetoothProviderProps) {
  const { sessionId, confirmClimbOnWall, setSessionBoardSerial, lastConnectedBoardSerial } = useQueueSessionControls();
  const { t } = useTranslation('settings');
  const sessionIdRef = useRef(sessionId);
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);
  const lastConnectedBoardSerialRef = useRef(lastConnectedBoardSerial);
  useEffect(() => {
    lastConnectedBoardSerialRef.current = lastConnectedBoardSerial;
  }, [lastConnectedBoardSerial]);

  const handleWallConfirmed = useCallback(
    (climbUuid: string) => {
      emitWallConfirm(climbUuid);
      if (sessionIdRef.current) {
        void confirmClimbOnWall(climbUuid);
      }
    },
    [confirmClimbOnWall],
  );

  const handleConnectSuccess = useCallback(
    (serial: string | null) => {
      if (!serial) return;
      if (!sessionIdRef.current) return;
      const previousSerial = lastConnectedBoardSerialRef.current;
      if (previousSerial === serial) return;
      lastConnectedBoardSerialRef.current = serial;
      void setSessionBoardSerial(serial);
      track('Session Board Serial Set', {
        mode: 'party',
        previousSerialKnown: previousSerial != null,
        boardLayout: boardName ?? '',
      });
    },
    [boardName, setSessionBoardSerial],
  );

  // Hold placements for the active board, required by the hook's
  // mirrored-frames conversion (hold id → mirroredHoldId). Without this every
  // `mirrored: true` send silently wrote the unmirrored frames to the wall.
  // getBoardRenderData is pure + memoised by board-config key, so this is a
  // cache lookup on re-render.
  const holdsData = useMemo(() => {
    if (!boardName || layoutId === undefined || sizeId === undefined || !setIds) return undefined;
    const parsedSetIds = setIds
      .split(',')
      .map((setId) => Number(setId.trim()))
      // `Number('')` is 0, so a trailing comma would smuggle a bogus set ID 0
      // into the render-data lookup — real set IDs are positive. Keep in
      // lockstep with DeviceCard's parseSetIds.
      .filter((setId) => Number.isInteger(setId) && setId > 0);
    if (parsedSetIds.length === 0) return undefined;
    return (
      getBoardRenderData({ boardName: boardName as BoardName, layoutId, sizeId, setIds: parsedSetIds })?.holdsData ??
      undefined
    );
  }, [boardName, layoutId, sizeId, setIds]);

  const { isConnected, loading, connect, disconnect, sendFramesToBoard, pickerState, reconnectSerialForCurrentBoard } =
    useBoardBluetooth({
      boardName,
      layoutId,
      sizeId,
      setIds,
      boardUuid,
      holdsData,
      onConnectSuccess: handleConnectSuccess,
    });

  const resolvedPickerBoards = useResolvedBleDeviceBoards(pickerState?.devices ?? EMPTY_PICKER_DEVICES);
  const currentBoardConfig = useMemo(() => {
    if (!boardName || layoutId === undefined || sizeId === undefined || !setIds) return undefined;
    const typedBoardName = toBoardName(boardName);
    if (!typedBoardName) return undefined;
    return {
      boardName: typedBoardName,
      layoutId,
      sizeId,
      setIds,
    };
  }, [boardName, layoutId, sizeId, setIds]);

  // handlePickerSelect, handleMismatchSwitch and the auto-connect effect all
  // need the latest pickerState / resolvedPickerBoards / currentBoardConfig, but
  // pickerState is a fresh object on every scan-progress push. Listing it in a
  // useCallback dep array would churn the onSelect identity each push and defeat
  // DeviceCard's React.memo. Mirror the volatile inputs into refs and read
  // through them — latest-value semantics are exactly right for a tap handler,
  // so keep these handlers free of stale-closure-sensitive logic.
  const pickerStateRef = useRef(pickerState);
  pickerStateRef.current = pickerState;
  const resolvedPickerBoardsRef = useRef(resolvedPickerBoards);
  resolvedPickerBoardsRef.current = resolvedPickerBoards;
  const currentBoardConfigRef = useRef(currentBoardConfig);
  currentBoardConfigRef.current = currentBoardConfig;

  // Track how often the picker's serial→board resolution actually pays off:
  // keep the tallies fresh while the sheet is open (devices and resolutions
  // both stream in), then flush ONE summary event when it closes — per-device
  // or per-render events would massively overcount repeat advertisements.
  const pickerResolutionStatsRef = useRef<PickerResolutionStats | null>(null);
  useEffect(() => {
    if (pickerState) {
      pickerResolutionStatsRef.current = summarizePickerResolution(
        pickerState.devices,
        resolvedPickerBoards,
        currentBoardConfig,
      );
      return;
    }
    const finalStats = pickerResolutionStatsRef.current;
    if (!finalStats) return;
    pickerResolutionStatsRef.current = null;
    track(SHARED_EVENTS.BlePickerDevicesResolved, { ...finalStats, boardName });
  }, [pickerState, resolvedPickerBoards, currentBoardConfig, boardName]);

  const setActiveBoard = useSetActiveBoard();

  // One-shot request to silently reconnect to `serial` once the active board
  // config has actually switched to `configKey`. Set by the switch flow, cleared
  // by the effect below the moment it fires the reconnect. A single slot is
  // deliberate (last writer wins): each successful switch cancels the picker
  // that produced it, so a second request can only come from a newer flow whose
  // intent supersedes the first.
  const [pendingAutoConnect, setPendingAutoConnect] = useState<{ serial: string; configKey: string } | null>(null);

  // The switched config normally propagates within one re-render, so a request
  // still pending after this window means it can no longer complete (e.g. the
  // board switch was reverted before the props arrived). Drop it rather than
  // leave a stale one-shot armed that would fire on a much-later, unrelated
  // switch to the same config.
  useEffect(() => {
    if (!pendingAutoConnect) return;
    const expiryTimeoutId = setTimeout(() => setPendingAutoConnect(null), PENDING_AUTO_CONNECT_TTL_MS);
    return () => clearTimeout(expiryTimeoutId);
  }, [pendingAutoConnect]);

  useEffect(() => {
    if (!pendingAutoConnect) return;
    // Still on the old config — setActiveBoard's cache write hasn't propagated
    // new board props into this provider yet. Wait for the matching config so we
    // don't auto-connect against the LED placement map we're switching away from.
    if (!boardName || layoutId === undefined || sizeId === undefined) return;
    if (boardConfigKey(boardName, layoutId, sizeId) !== pendingAutoConnect.configKey) return;
    // The old cancelled connect may still be settling. connect() bails while
    // connectInFlightRef is set (which tracks `loading`), so a new connect fired
    // now would be silently swallowed — wait for it to clear first.
    if (loading) return;
    const { serial } = pendingAutoConnect;
    setPendingAutoConnect(null);
    // connect's third param does a silent serial auto-select, falling back to the
    // picker only if that serial never advertises.
    void connect(undefined, undefined, serial);
  }, [pendingAutoConnect, boardName, layoutId, sizeId, loading, connect]);

  const handleMismatchSwitch = useCallback(
    async (decision: Extract<PickerSelectionDecision, { kind: 'mismatch' }>) => {
      try {
        let board: UserBoard;
        if (decision.entry.kind === 'saved') {
          board = decision.entry.board;
        } else {
          const { boardUuid: recordedBoardUuid } = decision.entry.config;
          if (!recordedBoardUuid) {
            throw new Error('Recorded board config has no saved board to switch to');
          }
          // Lazy-import the GraphQL client + document so the static module graph
          // (and the expo-secure-store auth chain it drags in) only loads when a
          // recorded-config switch actually runs.
          const [{ getHttpClient }, { GET_BOARD }] = await Promise.all([
            import('../lib/graphql/client'),
            import('../lib/graphql/operations'),
          ]);
          const response = await getHttpClient().request<GetBoardQueryResponse>(GET_BOARD, {
            boardUuid: recordedBoardUuid,
          });
          if (!response.board) {
            throw new Error(`No board found for uuid ${recordedBoardUuid}`);
          }
          board = response.board;
        }
        await setActiveBoard(board);
        // Only cancel the picker once the switch actually went through: a failed
        // board fetch above leaves the picker open so the user can still pick a
        // device or use Connect anyway. The cancel rejects the old connect's
        // picker promise with the silent user-cancel signature (no "connection
        // failed" alert), which clears `loading` and lets the auto-connect
        // effect fire against the switched config.
        pickerStateRef.current?.handleCancel();
        setPendingAutoConnect({
          serial: decision.serial,
          configKey: boardConfigKey(decision.config.boardName, decision.config.layoutId, decision.config.sizeId),
        });
      } catch (error) {
        console.error('Failed to switch to correct board config:', error);
        Alert.alert(t('boardConfigMismatch.title'), t('boardConfigMismatch.mobileSwitchFailed'));
      }
    },
    [setActiveBoard, t],
  );

  const handlePickerSelect = useCallback(
    (deviceId: string) => {
      const activePickerState = pickerStateRef.current;
      if (!activePickerState) return;
      const activeBoardConfig = currentBoardConfigRef.current;
      const decision = decideBlePickerSelection({
        deviceId,
        devices: activePickerState.devices,
        resolvedBoards: resolvedPickerBoardsRef.current,
        currentBoardConfig: activeBoardConfig,
      });
      if (decision.kind === 'forward') {
        activePickerState.handleSelect(deviceId);
        return;
      }

      const currentLabel = activeBoardConfig
        ? formatPickerBoardConfig(t, activeBoardConfig)
        : t('boardConfigMismatch.mobileUnknownConfig');
      const recordedLabel = formatPickerBoardConfig(t, decision.config);
      const canSwitch =
        decision.entry.kind === 'saved' ||
        (decision.entry.kind === 'recorded' && decision.entry.config.boardUuid != null);
      const buttons = [
        { text: t('boardConfigMismatch.cancel'), style: 'cancel' as const },
        {
          text: t('boardConfigMismatch.connectAnyway'),
          style: 'destructive' as const,
          onPress: () => activePickerState.handleSelect(deviceId),
        },
        ...(canSwitch
          ? [
              {
                text: t('boardConfigMismatch.switchToCorrect'),
                onPress: () => void handleMismatchSwitch(decision),
              },
            ]
          : []),
      ];
      Alert.alert(
        t('boardConfigMismatch.title'),
        [
          t('boardConfigMismatch.intro'),
          t('boardConfigMismatch.mobileCurrentLabel', { config: currentLabel }),
          t('boardConfigMismatch.mobileRecordedLabel', { config: recordedLabel }),
        ].join('\n\n'),
        buttons,
      );
    },
    [handleMismatchSwitch, t],
  );

  const clearBoard = useCallback(() => sendFramesToBoard(''), [sendFramesToBoard]);

  // Bumped by `reassertWall()` to force the auto-sender to re-push the current
  // climb once, bypassing the byte-identical dedup.
  const [reassertNonce, setReassertNonce] = useState(0);
  const reassertWall = useCallback(() => setReassertNonce((nonce) => nonce + 1), []);

  // Detect an unexpected drop (connected → disconnected without a user-initiated
  // disconnect) for telemetry only. `isUserDisconnectRef` suppresses deliberate ones.
  const wasConnectedRef = useRef(false);
  const isUserDisconnectRef = useRef(false);

  // Wrap disconnect to track user-initiated disconnects
  const wrappedDisconnect = useCallback(async () => {
    isUserDisconnectRef.current = true;
    track(SHARED_EVENTS.BluetoothDisconnected, { boardName, reason: 'user', inSession: sessionIdRef.current != null });
    try {
      await disconnect();
    } catch {
      // The native iOS adapter's disconnect() can reject (e.g. peripheral
      // already torn down). Callers `void` this promise, so an unhandled
      // rejection would surface as Sentry noise. Connection state is cleared
      // before the await, so the disconnect is effectively done either way —
      // safe to swallow, matching the keep-awake `.catch(() => {})` pattern.
    } finally {
      isUserDisconnectRef.current = false;
    }
  }, [disconnect, boardName]);

  // Register with the module-level status store so consumers rendered outside
  // this provider (e.g. the root tab bar, the long-press BLE controls sheet) can
  // observe BT connection state and force a disconnect. Register the instrumented
  // `wrappedDisconnect` so a force-disconnect is still tracked as user-initiated
  // (not mis-tagged as an unexpected drop). The store expects () => void.
  useEffect(() => {
    if (!isConnected) return;
    const release = registerBluetoothConnection(() => {
      void wrappedDisconnect();
    });
    return release;
  }, [isConnected, wrappedDisconnect]);

  // Losing the BLE link is expected (RF noise, or another climber grabbing the
  // last-connection-wins board), so an unexpected drop just lets the lightbulb go
  // unlit (driven by isConnected) — we never auto-reconnect, buzz an error, or pop
  // the device picker. Reconnecting stays a deliberate lightbulb tap. Recorded so
  // drop frequency stays visible in analytics.
  useEffect(() => {
    if (wasConnectedRef.current && !isConnected && !isUserDisconnectRef.current) {
      track(SHARED_EVENTS.BluetoothDisconnected, {
        boardName,
        reason: 'unexpected',
        inSession: sessionIdRef.current != null,
      });
    }
    wasConnectedRef.current = isConnected;
  }, [isConnected, boardName]);

  const value = useMemo<BluetoothContextValue>(
    () => ({
      isConnected,
      loading,
      connect,
      disconnect: wrappedDisconnect,
      sendFramesToBoard,
      clearBoard,
      reassertWall,
      reconnectSerialForCurrentBoard,
    }),
    [
      isConnected,
      loading,
      connect,
      wrappedDisconnect,
      sendFramesToBoard,
      clearBoard,
      reassertWall,
      reconnectSerialForCurrentBoard,
    ],
  );

  return (
    <BluetoothContext.Provider value={value}>
      {isConnected && (
        <BluetoothAutoSender
          sendFramesToBoard={sendFramesToBoard}
          onWallConfirmed={handleWallConfirmed}
          reassertNonce={reassertNonce}
        />
      )}
      {children}
      {pickerState && (
        <DevicePickerSheet
          devices={pickerState.devices}
          onSelect={handlePickerSelect}
          onDismiss={pickerState.handleCancel}
          isScanning={pickerState.isScanning}
          resolvedBoards={resolvedPickerBoards}
          currentBoardConfig={currentBoardConfig}
        />
      )}
    </BluetoothContext.Provider>
  );
}

export function useBluetoothContext(): BluetoothContextValue {
  const context = useContext(BluetoothContext);
  if (!context) {
    throw new Error('useBluetoothContext must be used within a BluetoothProvider');
  }
  return context;
}

/**
 * Returns the BluetoothContextValue if rendered inside a BluetoothProvider,
 * or null otherwise. Useful for components that may render before a board
 * is selected (and therefore before BluetoothProvider is mounted).
 */
export function useOptionalBluetoothContext(): BluetoothContextValue | null {
  return useContext(BluetoothContext);
}

export { BluetoothContext };
