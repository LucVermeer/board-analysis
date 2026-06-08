import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { View, Pressable, StyleSheet, type LayoutChangeEvent } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BottomSheetModal,
  BottomSheetBackdrop,
  BottomSheetHandle,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
  type BottomSheetHandleProps,
} from '@gorhom/bottom-sheet';
import type { BoardName, Climb } from '@boardsesh/shared-schema';
import type { ClimbQueueItem, PlaylistSuggestionSource } from '@boardsesh/queue';
import { randomUUID } from 'expo-crypto';
import { computeNavigationStateWithSuggestions, boardSupportsMirroring } from '@boardsesh/play-view';
import { climbToQueueItem } from '../../lib/climb-to-queue-item';
import type { ActiveSubDrawer } from '@boardsesh/play-view';
import { SHARED_EVENTS } from '@boardsesh/analytics';
import { SwipeBoardCarousel } from './SwipeBoardCarousel';
import { PlaybackControls } from './PlaybackControls';
import { useMobilePlayback } from './use-mobile-playback';
import { PlayDrawerHeader } from './PlayDrawerHeader';
import { PlayDrawerActionBar } from './PlayDrawerActionBar';
import { LogAscentSheet } from '../LogAscentSheet';
import { DeferredSections } from './DeferredSections';
import { AngleSelectorSheet } from './AngleSelectorSheet';
import { ClimbActionsSheet } from '../ClimbActionsSheet';
import { BleControlSheet } from '../ble/BleControlSheet';
import { GlassSheetBackground } from '../GlassSheetBackground';
import { Icon } from '../Icon';
import { useQueue } from '../../providers/queue-provider';
import { useOptionalBluetoothContext } from '../../providers/bluetooth-provider';
import { useToast } from '../../providers/toast-provider';
import { useToggleFavorite } from '../../lib/graphql/hooks';
import { useGradeFormat } from '../../hooks/use-grade-format';
import { useShareClimb } from '../../hooks/use-share-climb';
import { getBoardRenderData } from '../../lib/board-details';
import { hapticSuccess } from '../../lib/haptics';
import { usePlayDrawerWakeLock } from './use-play-drawer-wake-lock';
import {
  buildPlayDrawerBoardLayout,
  derivePlayDrawerLightbulbPressAction,
  derivePlayDrawerLightbulbState,
  derivePlayDrawerPreviousDriver,
  isPlayDrawerPreviewOnly,
  resolvePlayDrawerWallControlQueueItem,
  shouldRestoreFailedTakeControlPreview,
} from './lightbulb-control';
import { useWallConfirmFallback } from './use-wall-confirm-fallback';
import { track } from '../../lib/analytics';
import { iosSystemColors } from '../../theme/ios-colors';
import { spacing, sheetStyles } from '../../theme/tokens';

type BoardConfig = {
  boardName: string;
  layoutId: number;
  sizeId: number;
  setIds: string;
  angle: number;
};

export type PlayDrawerOpenOptions = {
  /**
   * When `true` (default), the opened climb is dispatched through
   * `setCurrentClimb`, which both makes it the active climb and appends
   * it to the queue. Pass `false` when the drawer is being opened for a
   * climb that's already current (e.g. from the persistent queue bar),
   * to avoid duplicating that climb at the end of the queue — the queue
   * item wrapper carries a fresh uuid, so the reducer's idempotency
   * guards key off uuid and don't catch the duplicate.
   */
  setAsCurrent?: boolean;
  /**
   * Local-only playlist source for party non-driver previews. It drives drawer
   * next/previous suggestions without mutating the shared queue until the
   * lightbulb promotes the preview to wall control.
   */
  previewPlaylistSuggestionSource?: PlaylistSuggestionSource | null;
  /** Queue item to display locally without making it current. Used by
   * preview-only queue-sheet opens so navigation has the right queue anchor. */
  previewQueueItem?: ClimbQueueItem | null;
};

export type PlayDrawerHandle = {
  open: (climb: Climb, options?: PlayDrawerOpenOptions) => void;
  close: () => void;
};

type PlayDrawerProps = {
  boardConfig: BoardConfig;
  onAngleChange?: (angle: number) => void;
  /** When false, the board's angle is fixed — the angle pill is hidden. */
  isAngleAdjustable?: boolean;
  /** Open the queue list sheet (provided by DrawerHostProvider; passed as a prop
   *  rather than read via useDrawerHost to avoid a host↔PlayDrawer require cycle). */
  onOpenQueue: () => void;
};

export const PlayDrawer = forwardRef<PlayDrawerHandle, PlayDrawerProps>(function PlayDrawer(
  { boardConfig, onAngleChange, isAngleAdjustable = true, onOpenQueue },
  ref,
) {
  const { t } = useTranslation('session');
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheetModal>(null);
  const [drawerPreviewItem, setDrawerPreviewItem] = useState<ClimbQueueItem | null>(null);
  const [drawerPreviewSuggestionSource, setDrawerPreviewSuggestionSource] = useState<PlaylistSuggestionSource | null>(
    null,
  );
  const [isMirrored, setIsMirrored] = useState(false);
  const [isFavorited, setIsFavorited] = useState(false);
  const [isTickBarActive, setIsTickBarActive] = useState(false);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [activeSubDrawer, setActiveSubDrawer] = useState<ActiveSubDrawer>('none');
  const [bleControlOpen, setBleControlOpen] = useState(false);
  const [pendingClimbUuid, setPendingClimbUuid] = useState<string | null>(null);
  const wallControlPressOperationRef = useRef(0);
  const resetZoomRef = useRef<(() => void) | null>(null);

  // Measured heights driving the peek snap-point. The peek opens the drawer
  // just far enough to reveal the Beta Videos section header. Because board
  // carousel height varies by board/layout and the gorhom handle owns its own
  // padding, every contributor is measured at runtime rather than hardcoded.
  const [handleHeight, setHandleHeight] = useState(0);
  const [aboveFoldHeight, setAboveFoldHeight] = useState(0);
  const [betaHeaderHeight, setBetaHeaderHeight] = useState(0);

  const setHeightIfChanged = (setter: (updater: (prev: number) => number) => void, measured: number) => {
    setter((prev) => (Math.abs(prev - measured) > 2 ? Math.round(measured) : prev));
  };
  const handleHandleLayout = useCallback((event: LayoutChangeEvent) => {
    setHeightIfChanged(setHandleHeight, event.nativeEvent.layout.height);
  }, []);
  const handleAboveFoldLayout = useCallback((event: LayoutChangeEvent) => {
    setHeightIfChanged(setAboveFoldHeight, event.nativeEvent.layout.height);
  }, []);
  const handleBetaHeaderLayout = useCallback((measured: number) => {
    setHeightIfChanged(setBetaHeaderHeight, measured);
  }, []);

  // Tracks the last climb the corrective snap fired for. Without this, every
  // aboveFold re-measurement on climb-switch would yank a user-expanded sheet
  // back to peek; gating on UUID means the snap fires exactly once per climb
  // and leaves manual user expansion alone afterwards.
  const lastSnappedClimbUuidRef = useRef<string | null>(null);

  const {
    state,
    setCurrentClimb,
    nextClimb,
    previousClimb,
    playlistSuggestionSource,
    sessionId,
    addToQueue,
    takeControl,
    releaseControl,
    driverParticipantId,
    participantId,
    lastConnectedBoardSerial,
  } = useQueue();
  const bluetooth = useOptionalBluetoothContext();
  const { mutate: toggleFavoriteMutate } = useToggleFavorite();
  const { formatGrade } = useGradeFormat();

  const { boardName, layoutId, sizeId, setIds, angle } = boardConfig;
  const bluetoothConnected = bluetooth?.isConnected ?? false;
  const bluetoothLoading = bluetooth?.loading ?? false;

  usePlayDrawerWakeLock(isSheetOpen);

  const boardLayout = useMemo(
    () => buildPlayDrawerBoardLayout({ boardName, layoutId, sizeId }),
    [boardName, layoutId, sizeId],
  );

  const boardRenderData = useMemo(() => {
    const parsedSetIds = setIds.split(',').map(Number);
    return getBoardRenderData({
      boardName: boardName as BoardName,
      layoutId,
      sizeId,
      setIds: parsedSetIds,
    });
  }, [boardName, layoutId, sizeId, setIds]);

  const displayedQueueItem = drawerPreviewItem ?? state.currentClimbQueueItem;
  const displayedClimb = displayedQueueItem?.climb;
  const displayedClimbUuidRef = useRef<string | null>(null);
  displayedClimbUuidRef.current = displayedClimb?.uuid ?? null;
  const lightbulbState = useMemo(
    () =>
      derivePlayDrawerLightbulbState({
        sessionId,
        driverParticipantId,
        participantId,
        isBluetoothConnected: bluetoothConnected,
        isBluetoothLoading: bluetoothLoading,
        pendingClimbUuid,
      }),
    [sessionId, driverParticipantId, participantId, bluetoothConnected, bluetoothLoading, pendingClimbUuid],
  );
  const isPartyPreviewOnly = isPlayDrawerPreviewOnly(lightbulbState);
  const navigationSuggestionSource = drawerPreviewSuggestionSource ?? playlistSuggestionSource;
  const navigationState = useMemo(
    () => computeNavigationStateWithSuggestions(state.queue, displayedQueueItem, navigationSuggestionSource),
    [state.queue, displayedQueueItem, navigationSuggestionSource],
  );

  // Multi-frame route playback (animation + BLE + party-sync). Boulders
  // short-circuit inside the hook (isAnimatable === false), so nothing renders
  // and the drawer behaves exactly as before for single-frame climbs.
  const playback = useMobilePlayback({
    climb: displayedClimb ?? null,
    boardName: boardName as BoardName,
    mirrored: isMirrored,
    isOpen: isSheetOpen,
  });

  // Auto-close tick bar when climb changes
  const displayedClimbUuid = displayedClimb?.uuid;
  useEffect(() => {
    setIsTickBarActive(false);
  }, [displayedClimbUuid]);

  // When the board angle changes, drop the locally-pinned climb so the drawer
  // re-derives the displayed climb from currentClimbQueueItem — which the queue
  // re-grade effect patches with the new angle's grade. Without this, the header
  // would keep showing the stale grade baked into the locally-held climb.
  useEffect(() => {
    setDrawerPreviewItem(null);
  }, [angle]);

  const { showToast } = useToast();

  const shareClimb = useShareClimb({
    climb: displayedClimb ?? null,
    boardName,
    layoutId,
    sizeId,
    setIds,
    angle,
  });

  // Android can throw on share cancellation; surface anything we didn't expect
  // rather than silently swallowing the rejection.
  const handleShare = useCallback(() => {
    shareClimb().catch((error) => {
      console.warn('[playDrawer] share failed:', error);
      showToast(t('playView.shareError'), 'error');
    });
  }, [shareClimb, showToast, t]);

  const bluetoothConnect = useCallback(
    (frames?: string, mirrored?: boolean, targetSerial?: string) =>
      bluetooth?.connect(frames, mirrored, targetSerial) ?? Promise.resolve(false),
    [bluetooth],
  );

  const handleWallConfirmed = useCallback((info: { climbUuid: string }) => {
    setPendingClimbUuid((currentClimbUuid) => (currentClimbUuid === info.climbUuid ? null : currentClimbUuid));
  }, []);
  const handleWallConfirmTimeout = useCallback((info: { climbUuid: string }) => {
    setPendingClimbUuid((currentClimbUuid) => (currentClimbUuid === info.climbUuid ? null : currentClimbUuid));
  }, []);
  const { armWatcher: armWallConfirmWatcher, cancelWatcher: cancelWallConfirmWatcher } = useWallConfirmFallback(
    {
      sessionId,
      isBluetoothConnected: bluetoothConnected,
      isBluetoothSupported: bluetooth !== null,
      lastConnectedBoardSerial,
      isPersistentSessionActive: lightbulbState.isPersistentSessionActive,
      bluetoothConnect,
    },
    { onConfirmed: handleWallConfirmed, onTimeout: handleWallConfirmTimeout },
  );

  const cancelPendingWallControlAttempt = useCallback(() => {
    wallControlPressOperationRef.current += 1;
    cancelWallConfirmWatcher();
    setPendingClimbUuid(null);
  }, [cancelWallConfirmWatcher]);

  const pendingSessionIdRef = useRef(sessionId);
  useEffect(() => {
    const didSessionChange = pendingSessionIdRef.current !== sessionId;
    pendingSessionIdRef.current = sessionId;
    if (pendingClimbUuid !== null && (!lightbulbState.isPersistentSessionActive || didSessionChange)) {
      cancelPendingWallControlAttempt();
    }
  }, [cancelPendingWallControlAttempt, lightbulbState.isPersistentSessionActive, pendingClimbUuid, sessionId]);

  useImperativeHandle(ref, () => ({
    open: (selectedClimb: Climb, options?: PlayDrawerOpenOptions) => {
      cancelPendingWallControlAttempt();
      const previewPlaylistSuggestionSource = options?.previewPlaylistSuggestionSource ?? null;
      const shouldShowCurrentQueueItem =
        options?.setAsCurrent === false &&
        options.previewQueueItem == null &&
        previewPlaylistSuggestionSource === null &&
        state.currentClimbQueueItem?.climb.uuid === selectedClimb.uuid;
      const selectedItem = shouldShowCurrentQueueItem
        ? null
        : (options?.previewQueueItem ??
          climbToQueueItem(selectedClimb, { suggested: previewPlaylistSuggestionSource !== null }));
      setDrawerPreviewSuggestionSource(previewPlaylistSuggestionSource);
      setDrawerPreviewItem(selectedItem);
      setIsMirrored(false);
      setIsFavorited(false);
      setIsTickBarActive(false);
      setIsSheetOpen(true);
      setActiveSubDrawer('none');
      lastSnappedClimbUuidRef.current = null;
      if (selectedItem && (options?.setAsCurrent ?? true) && !isPartyPreviewOnly) {
        // Fresh activation from the list/search clears any playlist suggestion
        // source (web passes the same null option on every non-playlist set).
        setCurrentClimb(selectedItem, { playlistSuggestionSource: null });
      }
      sheetRef.current?.present();
    },
    close: () => {
      sheetRef.current?.dismiss();
    },
  }));

  const handleClose = useCallback(() => {
    cancelPendingWallControlAttempt();
    setDrawerPreviewItem(null);
    setDrawerPreviewSuggestionSource(null);
    setIsMirrored(false);
    setIsTickBarActive(false);
    setIsSheetOpen(false);
    setActiveSubDrawer('none');
    lastSnappedClimbUuidRef.current = null;
  }, [cancelPendingWallControlAttempt]);

  const handlePrev = useCallback(() => {
    cancelPendingWallControlAttempt();
    if (isPartyPreviewOnly) {
      if (navigationState.prevItem) {
        setDrawerPreviewItem(navigationState.prevItem);
      }
    } else {
      setDrawerPreviewItem(null);
      previousClimb();
    }
    setIsMirrored(false);
    setIsFavorited(false);
  }, [cancelPendingWallControlAttempt, isPartyPreviewOnly, navigationState.prevItem, previousClimb]);

  const handleNext = useCallback(() => {
    cancelPendingWallControlAttempt();
    if (isPartyPreviewOnly) {
      if (navigationState.nextItem) {
        setDrawerPreviewItem(navigationState.nextItem);
      }
    } else {
      setDrawerPreviewItem(null);
      nextClimb();
    }
    setIsMirrored(false);
    setIsFavorited(false);
  }, [cancelPendingWallControlAttempt, isPartyPreviewOnly, navigationState.nextItem, nextClimb]);

  const handleMirror = useCallback(() => {
    setIsMirrored((prev) => !prev);
  }, []);

  const handleToggleFavorite = useCallback(() => {
    if (!displayedClimb) return;
    hapticSuccess();
    const nextIsFavorited = !isFavorited;
    setIsFavorited(nextIsFavorited);
    track(SHARED_EVENTS.FavoriteToggle, {
      action: nextIsFavorited ? 'added' : 'removed',
      climbUuid: displayedClimb.uuid,
      boardName,
      layoutId,
      source: 'mobile_play_drawer',
    });
    toggleFavoriteMutate({
      input: {
        boardName,
        climbUuid: displayedClimb.uuid,
        angle,
      },
    });
  }, [displayedClimb, isFavorited, boardName, layoutId, angle, toggleFavoriteMutate]);

  const handleLightbulb = useCallback(() => {
    const pressAction = derivePlayDrawerLightbulbPressAction({
      hasBluetooth: bluetooth !== null,
      hasDisplayedClimb: displayedClimb !== null,
      isPersistentSessionActive: lightbulbState.isPersistentSessionActive,
      isDriver: lightbulbState.isDriver,
      isBluetoothConnected: bluetoothConnected,
    });
    if (pressAction === 'noop') return;

    const previousDriver = derivePlayDrawerPreviousDriver({ driverParticipantId, participantId });

    if (pressAction === 'release_party') {
      wallControlPressOperationRef.current += 1;
      cancelWallConfirmWatcher();
      setPendingClimbUuid(null);
      void releaseControl()
        .then(() => {
          track('Wall Control Released', {
            reason: 'manual',
            mode: 'party',
            boardLayout,
          });
        })
        .catch((error: unknown) => {
          console.error('[playDrawer] failed to release wall control:', error);
        });
      return;
    }

    if (pressAction === 'connect_solo') {
      if (!bluetooth) return;
      track('Wall Control Taken', {
        source: 'lightbulb_drawer',
        previousDriver,
        mode: 'solo',
        boardLayout,
        climbUuid: displayedClimb?.uuid ?? null,
      });
      const reconnectSerialForBoard = bluetooth.reconnectSerialForCurrentBoard;
      if (reconnectSerialForBoard) {
        void bluetooth.connect(undefined, undefined, reconnectSerialForBoard);
      } else {
        void bluetooth.connect();
      }
      return;
    }

    if (!displayedClimb) return;

    if (pressAction === 'reassert_solo') {
      if (!bluetooth) return;
      // Already connected — re-light the current climb. Re-tapping the lightbulb
      // re-pushes the wall (and trips disconnect detection if the link is dead).
      bluetooth.reassertWall();
      setDrawerPreviewItem(null);
      track('Wall Control Taken', {
        source: 'lightbulb_drawer',
        previousDriver,
        mode: 'solo',
        boardLayout,
        climbUuid: displayedClimb.uuid,
      });
      return;
    }

    const queueItem = resolvePlayDrawerWallControlQueueItem({
      displayedQueueItem,
      displayedClimb,
      createQueueItem: (queueItemClimb, options) =>
        climbToQueueItem(queueItemClimb as unknown as Parameters<typeof climbToQueueItem>[0], options),
    });
    const operationId = wallControlPressOperationRef.current + 1;
    wallControlPressOperationRef.current = operationId;
    setDrawerPreviewItem(null);
    setPendingClimbUuid(displayedClimb.uuid);
    const takeControlOptions = drawerPreviewSuggestionSource
      ? { playlistSuggestionSource: drawerPreviewSuggestionSource }
      : undefined;
    void takeControl(queueItem, takeControlOptions)
      .then(() => {
        track('Wall Control Taken', {
          source: 'lightbulb_drawer',
          previousDriver,
          mode: 'party',
          boardLayout,
          climbUuid: displayedClimb.uuid,
        });
      })
      .catch((error: unknown) => {
        const shouldHandleFailure = wallControlPressOperationRef.current === operationId;
        if (!shouldHandleFailure) return;
        console.error('[playDrawer] failed to take wall control:', error);
        cancelWallConfirmWatcher();
        setPendingClimbUuid((currentClimbUuid) => (currentClimbUuid === displayedClimb.uuid ? null : currentClimbUuid));
        if (
          shouldRestoreFailedTakeControlPreview({
            failedOperationId: operationId,
            latestOperationId: wallControlPressOperationRef.current,
            failedClimbUuid: displayedClimb.uuid,
            displayedClimbUuid: displayedClimbUuidRef.current,
          })
        ) {
          setDrawerPreviewItem((currentItem) => currentItem ?? queueItem);
        }
      });
    armWallConfirmWatcher({
      climbUuid: displayedClimb.uuid,
      mode: 'party',
      boardLayout,
    });
  }, [
    bluetooth,
    driverParticipantId,
    participantId,
    lightbulbState.isPersistentSessionActive,
    lightbulbState.isDriver,
    cancelWallConfirmWatcher,
    releaseControl,
    boardLayout,
    bluetoothConnected,
    displayedClimb,
    displayedQueueItem,
    takeControl,
    drawerPreviewSuggestionSource,
    armWallConfirmWatcher,
  ]);

  const handleLightbulbLongPress = useCallback(() => {
    if (!bluetooth?.isConnected) return;
    // Reveal the BLE controls (Re-light / Disconnect) rather than disconnecting
    // blind — keeps the destructive action behind a labelled menu.
    setBleControlOpen(true);
  }, [bluetooth]);

  // Close the BLE controls sheet if the link drops while it's open — otherwise
  // it lingers showing Re-light / Disconnect actions that no-op on a dead link.
  useEffect(() => {
    if (!bluetoothConnected) setBleControlOpen(false);
  }, [bluetoothConnected]);

  const handleOpenActions = useCallback(() => {
    setActiveSubDrawer('actions');
  }, []);

  const handleOpenAngleSelector = useCallback(() => {
    setActiveSubDrawer('angleSelector');
  }, []);

  const handleCloseSubDrawer = useCallback(() => {
    setActiveSubDrawer('none');
  }, []);

  const handleTickFabPress = useCallback(() => {
    resetZoomRef.current?.();
    setIsTickBarActive(true);
  }, []);

  // Long-press now opens the same QuickTickBar as a short press; LogAscentSheet
  // has been retired in favour of a single ticking surface (see PR #2366).
  const handleTickFabLongPress = useCallback(() => {
    resetZoomRef.current?.();
    setIsTickBarActive(true);
  }, []);

  const handleTickBarDismiss = useCallback(() => {
    setIsTickBarActive(false);
  }, []);

  const handleResetZoomReady = useCallback((resetFn: () => void) => {
    resetZoomRef.current = resetFn;
  }, []);

  const handleSimilarClimbPress = useCallback(
    (similarClimb: Climb) => {
      cancelPendingWallControlAttempt();
      const queueItem = climbToQueueItem(similarClimb);
      setDrawerPreviewItem(queueItem);
      setDrawerPreviewSuggestionSource(null);
      setIsMirrored(false);
      setIsFavorited(false);
      setIsTickBarActive(false);
      if (isPartyPreviewOnly) return;
      addToQueue(queueItem);
      setCurrentClimb(queueItem, { playlistSuggestionSource: null });
    },
    [addToQueue, cancelPendingWallControlAttempt, isPartyPreviewOnly, setCurrentClimb],
  );

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.5} />
    ),
    [],
  );

  // Custom handle component wraps gorhom's default in a View whose onLayout
  // reports the actual handle height (depends on indicator style + paddings).
  // Memoized so gorhom doesn't see a new component identity each render.
  const HandleComponent = useMemo(
    () => (props: BottomSheetHandleProps) => (
      <View onLayout={handleHandleLayout}>
        <BottomSheetHandle {...props} indicatorStyle={sheetStyles.indicator} />
      </View>
    ),
    [handleHandleLayout],
  );

  // Sum the contributors so the Beta Videos title is fully revealed at peek
  // with a small reveal margin below (the cue that there's more to scroll).
  //   handleHeight     — measured: gorhom sheet handle
  //   contentPadTop    — BottomSheetScrollView contentContainerStyle paddingTop
  //   aboveFoldHeight  — measured: drawer header + carousel + action bar
  //   deferredPadTop   — DeferredSections container.paddingTop (sits above Beta section)
  //   betaHeaderHeight — measured: Beta Videos CollapsibleSection header row
  //   revealMargin     — breathing room below the title so it doesn't hug the edge
  const peekHeight =
    handleHeight > 0 && aboveFoldHeight > 0 && betaHeaderHeight > 0
      ? handleHeight + spacing[2] + aboveFoldHeight + spacing[3] + betaHeaderHeight + spacing[3]
      : 0;

  const snapPoints = useMemo<(number | string)[]>(
    () => (peekHeight > 0 ? [peekHeight, '100%'] : ['100%']),
    [peekHeight],
  );

  // First-frame measurement may land after the sheet has already presented at
  // 100% — this single corrective snap settles into peek without a perceptible
  // full-screen flash on subsequent climb opens. Guarded by a per-climb ref so
  // it fires exactly once per climb (won't yank a user who has manually pulled
  // the sheet to 100% while reading; subsequent height re-measurements no-op).
  useEffect(() => {
    if (peekHeight === 0 || !isSheetOpen || !displayedClimbUuid) return;
    if (lastSnappedClimbUuidRef.current === displayedClimbUuid) return;
    lastSnappedClimbUuidRef.current = displayedClimbUuid;
    sheetRef.current?.snapToIndex(0);
  }, [peekHeight, isSheetOpen, displayedClimbUuid]);

  const ascentCount = displayedClimb?.userAscents ?? 0;
  const supportsMirroring = boardSupportsMirroring(boardName, layoutId);
  const subDrawerOpen = activeSubDrawer !== 'none';
  const lightbulbAccessibilityLabel = useMemo(() => {
    if (!lightbulbState.isPersistentSessionActive) return undefined;
    if (lightbulbState.isDriver) {
      if (!displayedClimb) return t('playView.actionBar.lightbulb.driving');
      return t('playView.actionBar.lightbulb.drivingNamed', { name: displayedClimb.name });
    }
    if (!displayedClimb) return t('playView.actionBar.lightbulb.take');
    return t('playView.actionBar.lightbulb.takeNamed', { name: displayedClimb.name });
  }, [displayedClimb, lightbulbState.isDriver, lightbulbState.isPersistentSessionActive, t]);

  return (
    <>
      <BottomSheetModal
        ref={sheetRef}
        snapPoints={snapPoints}
        index={0}
        topInset={insets.top}
        enablePanDownToClose
        enableContentPanningGesture={!subDrawerOpen}
        enableHandlePanningGesture={!subDrawerOpen}
        backdropComponent={renderBackdrop}
        backgroundComponent={GlassSheetBackground}
        handleComponent={HandleComponent}
        onDismiss={handleClose}
      >
        <BottomSheetScrollView
          style={styles.content}
          contentContainerStyle={{ paddingTop: spacing[2], paddingBottom: insets.bottom }}
        >
          <Pressable
            onPress={() => sheetRef.current?.dismiss()}
            accessibilityRole="button"
            accessibilityLabel={t('playView.closeAria')}
            style={styles.closeButton}
          >
            <Icon name="chevron.down" size={20} color={iosSystemColors.systemGray} />
          </Pressable>

          {displayedClimb && (
            <>
              <View onLayout={handleAboveFoldLayout}>
                <PlayDrawerHeader
                  name={displayedClimb.name}
                  difficulty={formatGrade(displayedClimb.difficulty) ?? displayedClimb.difficulty}
                  rawDifficulty={displayedClimb.difficulty}
                  qualityAverage={displayedClimb.quality_average}
                  ascensionistCount={displayedClimb.ascensionist_count}
                  setterUsername={displayedClimb.setter_username}
                />

                <View style={styles.boardSection}>
                  {boardRenderData && (
                    <SwipeBoardCarousel
                      boardName={boardName as BoardName}
                      boardRenderData={boardRenderData}
                      layoutId={layoutId}
                      sizeId={sizeId}
                      setIds={setIds}
                      currentFrames={displayedClimb.frames}
                      currentFrameOverride={playback.isAnimatable ? playback.currentFrameString : null}
                      nextFrames={navigationState.nextItem?.climb.frames ?? null}
                      prevFrames={navigationState.prevItem?.climb.frames ?? null}
                      mirrored={isMirrored}
                      canSwipeNext={navigationState.canNext}
                      canSwipePrevious={navigationState.canPrevious}
                      onSwipeNext={handleNext}
                      onSwipePrevious={handlePrev}
                      onResetZoomReady={handleResetZoomReady}
                      enabled={!isTickBarActive}
                    />
                  )}
                </View>

                {playback.isAnimatable && (
                  <PlaybackControls
                    frameIndex={playback.frameIndex}
                    frameCount={playback.frameCount}
                    isPlaying={playback.isPlaying}
                    speed={playback.speed}
                    paceMs={playback.paceMs}
                    onPlay={playback.play}
                    onPause={playback.pause}
                    onSeek={playback.seek}
                    onSpeedChange={playback.setSpeed}
                  />
                )}

                <PlayDrawerActionBar
                  canSwipePrevious={navigationState.canPrevious}
                  canSwipeNext={navigationState.canNext}
                  isMirrored={isMirrored}
                  supportsMirroring={supportsMirroring}
                  isFavorited={isFavorited}
                  remainingQueueCount={navigationState.remainingCount}
                  lightbulbActive={lightbulbState.lightbulbActive}
                  lightbulbPending={lightbulbState.lightbulbPending}
                  lightbulbAccessibilityLabel={lightbulbAccessibilityLabel}
                  lightbulbLongPressEnabled={bluetoothConnected}
                  ascentCount={ascentCount}
                  onPrevClick={handlePrev}
                  onNextClick={handleNext}
                  onMirror={handleMirror}
                  onToggleFavorite={handleToggleFavorite}
                  onLightbulb={handleLightbulb}
                  onLightbulbLongPress={handleLightbulbLongPress}
                  onOpenActions={handleOpenActions}
                  onOpenQueue={onOpenQueue}
                  onShare={handleShare}
                  onTickPress={handleTickFabPress}
                  onTickLongPress={handleTickFabLongPress}
                  currentAngle={angle}
                  onOpenAngleSelector={isAngleAdjustable ? handleOpenAngleSelector : undefined}
                />
              </View>

              {/* Below-fold deferred sections */}
              <DeferredSections
                climb={displayedClimb}
                boardName={boardName}
                layoutId={layoutId}
                sizeId={sizeId}
                setIds={setIds}
                angle={angle}
                enabled={isSheetOpen}
                onSimilarClimbPress={handleSimilarClimbPress}
                onBetaHeaderLayout={handleBetaHeaderLayout}
              />
            </>
          )}
        </BottomSheetScrollView>
      </BottomSheetModal>

      {/* Sub-drawer: Climb actions. Always mounted and toggled via `visible`
          (it presents as a BottomSheetModal with stackBehavior=push, the only
          way to render above the play drawer's own modal — same as the angle
          selector and tick sheet). A conditionally-mounted modal here would drop
          its present() over the already-open play drawer and never appear. */}
      <ClimbActionsSheet
        visible={activeSubDrawer === 'actions'}
        climb={displayedClimb ?? null}
        boardName={boardName as BoardName}
        layoutId={layoutId}
        sizeId={sizeId}
        setIds={setIds}
        angle={angle}
        onAddToQueue={() => {
          if (displayedClimb) {
            addToQueue({
              uuid: randomUUID(),
              climb: displayedClimb,
            });
          }
        }}
        onToggleFavorite={handleToggleFavorite}
        onClose={handleCloseSubDrawer}
      />

      {/* Sub-drawer: Angle selector. Always mounted and toggled via `visible`
          (it presents as a BottomSheetModal with stackBehavior=push, the only
          way to render above the play drawer's own modal — same as the tick
          sheet below). A plain BottomSheet here would open behind this modal. */}
      <AngleSelectorSheet
        visible={activeSubDrawer === 'angleSelector'}
        onClose={handleCloseSubDrawer}
        boardName={boardName}
        layoutId={layoutId}
        climbUuid={displayedClimb?.uuid}
        currentAngle={angle}
        onAngleChange={(newAngle) => {
          onAngleChange?.(newAngle);
          handleCloseSubDrawer();
        }}
      />

      {/* Tick sheet — sibling of the PlayDrawer modal so it renders above
          (gorhom `BottomSheetModal` with stackBehavior=push). Snap-point is
          60% so the climb image above stays visible while logging. */}
      {displayedClimb && (
        <LogAscentSheet
          visible={isTickBarActive}
          onDismiss={handleTickBarDismiss}
          climbUuid={displayedClimb.uuid}
          boardName={boardName}
          angle={angle}
          isMirror={isMirrored}
          isBenchmark={displayedClimb.benchmark_difficulty != null}
          layoutId={layoutId}
          sizeId={sizeId}
          setIds={setIds}
          sessionId={sessionId}
          consensusGradeName={displayedClimb.difficulty}
        />
      )}

      {/* BLE controls revealed by long-pressing the lightbulb. */}
      {bluetooth && (
        <BleControlSheet
          visible={bleControlOpen}
          onReassert={bluetooth.reassertWall}
          onDisconnect={() => void bluetooth.disconnect()}
          onClose={() => setBleControlOpen(false)}
        />
      )}
    </>
  );
});

const styles = StyleSheet.create({
  content: {
    flex: 1,
  },
  closeButton: {
    position: 'absolute',
    top: 8,
    left: 8,
    zIndex: 2,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(120, 120, 128, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  boardSection: {
    flex: 1,
    position: 'relative',
    marginHorizontal: spacing[4],
  },
});
