'use client';

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState, useMemo, useDeferredValue } from 'react';
import { useTranslation } from 'react-i18next';
import { track } from '@/app/lib/analytics';
import MuiBadge from '@mui/material/Badge';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import SyncOutlined from '@mui/icons-material/SyncOutlined';
import FavoriteBorderOutlined from '@mui/icons-material/FavoriteBorderOutlined';
import Favorite from '@mui/icons-material/Favorite';
import SkipPreviousOutlined from '@mui/icons-material/SkipPreviousOutlined';
import SkipNextOutlined from '@mui/icons-material/SkipNextOutlined';
import LightbulbOutlined from '@mui/icons-material/LightbulbOutlined';
import Lightbulb from '@mui/icons-material/Lightbulb';
import MoreHorizOutlined from '@mui/icons-material/MoreHorizOutlined';
import CloseOutlined from '@mui/icons-material/CloseOutlined';
import KeyboardArrowUpOutlined from '@mui/icons-material/KeyboardArrowUpOutlined';
import KeyboardArrowDownOutlined from '@mui/icons-material/KeyboardArrowDownOutlined';
import FormatListBulletedOutlined from '@mui/icons-material/FormatListBulletedOutlined';
import CheckOutlined from '@mui/icons-material/CheckOutlined';
import ChatBubbleOutlineOutlined from '@mui/icons-material/ChatBubbleOutlineOutlined';
import { TickIcon, TickButtonWithLabel } from '../logbook/tick-icon';
import type { ClimbQueueItem } from '../queue-control/types';
import { PersonFallingIcon } from '@/app/components/icons/person-falling-icon';
import { usePathname } from 'next/navigation';
import { useQueueActions, useCurrentClimb, useQueueList, useSessionData } from '../graphql-queue';
import { ClimbActions } from '../climb-actions';
import { useDoubleTapFavorite } from '../climb-actions/use-double-tap-favorite';
import HeartAnimationOverlay from '../climb-card/heart-animation-overlay';
import PlaylistSelectionContent from '../climb-actions/playlist-selection-content';
import DrawerClimbHeader from '../climb-card/drawer-climb-header';
import { LightControlDrawer } from '../board-page/light-control-drawer';
import { useLongPress } from '@/app/lib/hooks/use-long-press';
import { useBoardProvider } from '../board-provider/board-provider-context';
import SwipeBoardCarousel from '../board-renderer/swipe-board-carousel';
import { useWakeLock } from '../board-bluetooth-control/use-wake-lock';
import { useBluetoothContext } from '../board-bluetooth-control/bluetooth-context';
import { useWallConfirmFallback } from './use-wall-confirm-fallback';
import { themeTokens } from '@/app/theme/theme-config';
import SwipeableDrawer from '../swipeable-drawer/swipeable-drawer';
import AngleSelector from '../board-page/angle-selector';
import ClimbDetailHeader from '@/app/components/climb-detail/climb-detail-header';
import { QuickTickBar, type QuickTickBarHandle } from '../logbook/quick-tick-bar';
import { hasPriorHistoryForClimb } from '@/app/hooks/use-tick-save';
import type { ActiveDrawer } from '../queue-control/queue-control-bar';
import { PLAY_DRAWER_EVENT } from '../queue-control/play-drawer-event';
import {
  TOUR_CLOSE_PLAY_QUEUE_EVENT,
  TOUR_OPEN_PLAY_QUEUE_EVENT,
} from '@/app/components/onboarding/onboarding-tour-events';
import type { BoardDetails, Angle, Climb } from '@/app/lib/types';
import styles from './play-view-drawer.module.css';
import drawerCss from '../swipeable-drawer/swipeable-drawer.module.css';
import { useDrawerDragResize } from '@/app/hooks/use-drawer-drag-resize';
import ClimbDetailShellClient from '@/app/components/climb-detail/climb-detail-shell.client';
import { useBuildClimbDetailSections } from '@/app/components/climb-detail/build-climb-detail-sections';
import { renderBoard } from '@/app/lib/board-render-worker/worker-manager';
import { useNestedDrawerSwipe } from '@/app/lib/hooks/use-nested-drawer-swipe';
import { usePullToClose, findScrollContainer } from '@/app/lib/hooks/pull-to-close';
import { useSnackbar } from '../providers/snackbar-provider';
import { getGradeTintColor } from '@/app/lib/grade-colors';
import { useIsDarkMode } from '@/app/hooks/use-is-dark-mode';
import { getPreference, setPreference } from '@/app/lib/user-preferences-db';
import QueueDrawer from './queue-drawer';

/** Window with optional requestIdleCallback (not available in all browsers). */
type WindowWithIdleCallback = Window & {
  requestIdleCallback?: ((cb: () => void, opts?: { timeout: number }) => number) | undefined;
};

type PlayDrawerContentProps = {
  climb: Climb;
  boardType: string;
  angle: number;
  aboveFold: React.ReactNode;
  sectionsEnabled: boolean;
};

const PlayDrawerContent = React.memo<PlayDrawerContentProps>(
  ({ climb, boardType, angle, aboveFold, sectionsEnabled }) => {
    const sections = useBuildClimbDetailSections({
      climb,
      climbUuid: climb.uuid,
      boardType,
      angle,
      currentClimbDifficulty: climb.difficulty ?? undefined,
      boardName: boardType,
      enabled: sectionsEnabled,
    });

    return <ClimbDetailShellClient mode="play" sections={sections} aboveFold={aboveFold} />;
  },
);
PlayDrawerContent.displayName = 'PlayDrawerContent';

type PlayViewActionBarProps = {
  canSwipePrevious: boolean;
  canSwipeNext: boolean;
  isMirrored: boolean;
  supportsMirroring: boolean;
  isFavorited: boolean;
  remainingQueueCount: number;
  onPrevClick: () => void;
  onNextClick: () => void;
  onMirror: () => void;
  onToggleFavorite: () => void;
  onOpenActions: () => void;
  onOpenQueue: () => void;
  /** Whether the lightbulb should render as filled/lit. In party this is
   *  `isDriver` (you hold the wall). In solo it's `isBluetoothConnected`
   *  (a paired board IS the wall — when nothing's paired, the lightbulb is
   *  outlined to signal "tap to connect"). The driver concept doesn't carry
   *  any BLE meaning in solo, so the visual would always be lit if we used
   *  isDriver there — masking the actual connection state. */
  lightbulbActive: boolean;
  /** Wall-view mode: drawer opened from the bar body to inspect the wall
   *  climb. Hide prev/next entirely (controls live on the bar; this view is
   *  anchored to the wall). The lightbulb stays. */
  wallView?: boolean;
  /** Name of the currently displayed climb. Used in the lightbulb's aria
   *  label so screen-reader users hear what they're sending. */
  displayedClimbName: string | null;
  /** Pivot's lightbulb gesture: in solo it sends the climb to the wall via
   *  the existing BLE auto-sender path; in party it claims driver and
   *  broadcasts the climb. */
  onLightbulb: () => void;
  /** Long-press the lightbulb to open the light-control drawer (disco, party
   *  glyphs, palette, and the manual BLE disconnect). Optional — when the
   *  parent doesn't supply it, long-press is a no-op. */
  onLightbulbLongPress?: () => void;
  angleSelector?: React.ReactNode;
};

export const PlayViewActionBar = React.memo(function PlayViewActionBar({
  canSwipePrevious,
  canSwipeNext,
  isMirrored,
  supportsMirroring,
  isFavorited,
  remainingQueueCount,
  onPrevClick,
  onNextClick,
  onMirror,
  onToggleFavorite,
  onOpenActions,
  onOpenQueue,
  lightbulbActive,
  displayedClimbName,
  onLightbulb,
  onLightbulbLongPress,
  wallView = false,
  angleSelector,
}: PlayViewActionBarProps) {
  const { t } = useTranslation('session');
  // Lightbulb aria label — active (filled) vs inactive (outlined) framing
  // makes the action's destructive-vs-additive nature explicit for screen
  // readers. "Driving" copy reads fine in solo too (you're driving the board
  // when BLE is connected).
  const lightbulbLabel = displayedClimbName
    ? lightbulbActive
      ? t('playView.actionBar.lightbulb.drivingNamed', { name: displayedClimbName })
      : t('playView.actionBar.lightbulb.takeNamed', { name: displayedClimbName })
    : lightbulbActive
      ? t('playView.actionBar.lightbulb.driving')
      : t('playView.actionBar.lightbulb.take');
  // Long-press the lightbulb to reach the light-control drawer (and the
  // manual BLE disconnect that lives inside it). Tap stays the take-control
  // gesture; consumeLongPress() in the click handler swallows the synthesized
  // click that follows a long-press so we don't fire both.
  const { ref: lightbulbLongPressRef, consumeLongPress } = useLongPress<HTMLButtonElement>(onLightbulbLongPress);
  const handleLightbulbTap = useCallback(() => {
    if (consumeLongPress()) return;
    onLightbulb();
  }, [consumeLongPress, onLightbulb]);
  return (
    <div className={styles.actionBar}>
      {!wallView && (
        <IconButton disabled={!canSwipePrevious} onClick={onPrevClick}>
          <SkipPreviousOutlined />
        </IconButton>
      )}
      {supportsMirroring && (
        <IconButton
          color={isMirrored ? 'primary' : 'default'}
          onClick={onMirror}
          sx={
            isMirrored
              ? {
                  backgroundColor: themeTokens.colors.purple,
                  borderColor: themeTokens.colors.purple,
                  color: 'common.white',
                  '&:hover': { backgroundColor: themeTokens.colors.purple },
                }
              : undefined
          }
        >
          <SyncOutlined />
        </IconButton>
      )}
      <IconButton onClick={onToggleFavorite}>
        {isFavorited ? <Favorite sx={{ color: themeTokens.colors.error }} /> : <FavoriteBorderOutlined />}
      </IconButton>
      {/* Lightbulb: the queue-control-bar pivot's primary "send/take" gesture.
          Filled+amber-glowing when the lightbulb is active (driver in party,
          BLE-paired in solo); outlined when inactive (non-driver in party,
          unpaired in solo). The warm-amber styling matches the ShareBoardButton
          that this drawer replaced — it reads as "this bulb is lit" rather
          than the dusty-rose primary, which the user kept misreading as an
          error state. Long-press opens the light-control drawer (disco /
          glyphs / palette / manual disconnect). */}
      <IconButton ref={lightbulbLongPressRef} onClick={handleLightbulbTap} aria-label={lightbulbLabel}>
        {lightbulbActive ? (
          <Lightbulb
            sx={{
              color: themeTokens.colors.warning,
              '@keyframes connectedGlow': {
                '0%': { filter: `drop-shadow(0 0 2px ${themeTokens.colors.warning}99)` },
                '100%': { filter: `drop-shadow(0 0 6px ${themeTokens.colors.warning})` },
              },
              animation: 'connectedGlow 1.5s ease-in-out infinite alternate',
            }}
          />
        ) : (
          <LightbulbOutlined />
        )}
      </IconButton>
      {angleSelector}
      <IconButton onClick={onOpenActions} aria-label={t('playView.actionBar.climbActionsAria')}>
        <MoreHorizOutlined />
      </IconButton>
      <MuiBadge
        badgeContent={remainingQueueCount}
        max={99}
        sx={{
          '& .MuiBadge-badge': {
            backgroundColor: themeTokens.colors.primary,
            color: 'common.white',
          },
        }}
      >
        <IconButton onClick={onOpenQueue} aria-label={t('playView.actionBar.openQueueAria')}>
          <FormatListBulletedOutlined />
        </IconButton>
      </MuiBadge>
      {!wallView && (
        <IconButton disabled={!canSwipeNext} onClick={onNextClick}>
          <SkipNextOutlined />
        </IconButton>
      )}
    </div>
  );
});
PlayViewActionBar.displayName = 'PlayViewActionBar';

/**
 * Extracted tick bar component that owns its own `tickComment` state.
 * This prevents comment keystrokes from invalidating the parent `aboveFold` useMemo,
 * which would otherwise re-render the entire board carousel on every keystroke.
 */
type PlayViewTickBarProps = {
  isTickBarActive: boolean;
  currentClimb: Climb;
  angle: Angle;
  boardDetails: BoardDetails;
  onClose: () => void;
  onError: () => void;
};

export const PlayViewTickBar = React.memo<PlayViewTickBarProps>(function PlayViewTickBar({
  isTickBarActive,
  currentClimb,
  angle,
  boardDetails,
  onClose,
  onError,
}) {
  const { t } = useTranslation('session');
  const { logbook } = useBoardProvider();
  const [tickComment, setTickComment] = useState('');
  const [commentFocused, setCommentFocused] = useState(false);
  const [isFlash, setIsFlash] = useState(() => !hasPriorHistoryForClimb(currentClimb, logbook));
  const [tickBarExpanded, setTickBarExpanded] = useState(false);
  const quickTickBarRef = useRef<QuickTickBarHandle>(null);
  const isDark = useIsDarkMode();
  // Match queue control bar tint — 'default' variant.
  // In dark mode the tint is semi-transparent, so the backdrop-filter blur
  // fills in behind it. The fallback uses surfaceElevated (#121212) which
  // is visibly distinct from pure black.
  const gradeTintColor = useMemo(
    () => getGradeTintColor(currentClimb.difficulty, 'default', isDark),
    [currentClimb.difficulty, isDark],
  );

  // Restore persisted tick bar expanded state when tick bar opens
  useEffect(() => {
    if (isTickBarActive) {
      void getPreference<boolean>('tickBarExpanded').then((persisted) => {
        if (persisted === true) setTickBarExpanded(true);
      });
    }
  }, [isTickBarActive]);

  // Persist expanded state on user-initiated toggle (not on automatic resets)
  const handleTickBarExpandedChange = useCallback((expanded: boolean) => {
    setTickBarExpanded(expanded);
    void setPreference('tickBarExpanded', expanded);
  }, []);

  const handleCommentFocus = useCallback(() => setCommentFocused(true), []);
  const handleCommentBlur = useCallback(() => setCommentFocused(false), []);

  // Reset comment when the tick bar closes
  const handleClose = useCallback(() => {
    setTickComment('');
    setCommentFocused(false);
    setIsFlash(false);
    setTickBarExpanded(false);
    onClose();
  }, [onClose]);

  // Reset comment and recompute flash state when the climb changes.
  useEffect(() => {
    setTickComment('');
    setCommentFocused(false);
    setIsFlash(!hasPriorHistoryForClimb(currentClimb, logbook));
    setTickBarExpanded(false);
  }, [currentClimb, logbook]);

  return (
    <div className={`${styles.tickBarContainer} ${isTickBarActive ? styles.tickBarContainerActive : ''}`}>
      <div
        className={styles.tickBarInner}
        style={{
          backgroundColor: isDark ? 'var(--semantic-surfaceElevated)' : 'var(--semantic-surface)',
          // Grade tint as a solid overlay via linear-gradient (single-color gradient)
          ...(gradeTintColor ? { backgroundImage: `linear-gradient(${gradeTintColor}, ${gradeTintColor})` } : {}),
        }}
      >
        {isTickBarActive && (
          <>
            {/* Toolbar: expand left, close right — same pattern as queue-control-bar */}
            <div className={styles.tickBarToolbar}>
              <div
                className={styles.tickBarExpandButton}
                onClick={() => handleTickBarExpandedChange(!tickBarExpanded)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') handleTickBarExpandedChange(!tickBarExpanded);
                }}
                aria-label={tickBarExpanded ? t('playView.tickBar.collapseAria') : t('playView.tickBar.expandAria')}
              >
                {tickBarExpanded ? (
                  <KeyboardArrowDownOutlined sx={{ fontSize: 16, opacity: 0.7 }} />
                ) : (
                  <KeyboardArrowUpOutlined sx={{ fontSize: 16, opacity: 0.7 }} />
                )}
                <span className={styles.tickBarExpandLabel}>
                  {tickBarExpanded ? t('queueBar.tickBar.collapse') : t('queueBar.tickBar.expand')}
                </span>
              </div>
              <div className={styles.tickBarCloseButton}>
                <IconButton
                  size="small"
                  onClick={handleClose}
                  aria-label={t('playView.tickBar.closeAria')}
                  sx={{
                    color: 'text.primary',
                    backgroundColor: 'action.selected',
                    '&:hover': { backgroundColor: 'action.focus' },
                    padding: '2px',
                  }}
                >
                  <CloseOutlined sx={{ fontSize: 16 }} />
                </IconButton>
              </div>
            </div>
            <QuickTickBar
              ref={quickTickBarRef}
              currentClimb={currentClimb}
              angle={angle}
              boardDetails={boardDetails}
              onSave={handleClose}
              onError={onError}
              onDraftRestored={(draftComment) => setTickComment(draftComment)}
              onIsFlashChange={setIsFlash}
              comment={tickComment}
              expanded={tickBarExpanded}
              commentSlot={
                <div className={`${styles.tickBarComment} ${commentFocused ? styles.tickBarCommentExpanded : ''}`}>
                  <TextField
                    fullWidth
                    size="small"
                    variant="outlined"
                    placeholder={t('common:comment.shortPlaceholder')}
                    multiline
                    minRows={1}
                    maxRows={commentFocused ? 4 : 1}
                    value={tickComment}
                    onChange={(e) => setTickComment(e.target.value)}
                    onFocus={handleCommentFocus}
                    onBlur={handleCommentBlur}
                    slotProps={{
                      htmlInput: { maxLength: 2000, 'aria-label': 'Tick comment' },
                      input: {
                        startAdornment: (
                          <InputAdornment position="start">
                            <ChatBubbleOutlineOutlined sx={{ fontSize: 16, opacity: 0.5 }} />
                          </InputAdornment>
                        ),
                      },
                    }}
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        borderRadius: '8px',
                        backgroundColor: 'var(--input-bg)',
                        '& .MuiOutlinedInput-notchedOutline': {
                          borderColor: 'var(--neutral-200)',
                        },
                      },
                    }}
                  />
                </div>
              }
              expandedCommentSlot={
                <TextField
                  fullWidth
                  size="small"
                  variant="outlined"
                  placeholder={t('playView.tickBar.commentPlaceholder')}
                  multiline
                  minRows={2}
                  maxRows={4}
                  value={tickComment}
                  onChange={(e) => setTickComment(e.target.value)}
                  onFocus={handleCommentFocus}
                  onBlur={handleCommentBlur}
                  slotProps={{
                    htmlInput: { maxLength: 2000, 'aria-label': 'Tick comment' },
                  }}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      borderRadius: '8px',
                      backgroundColor: 'var(--input-bg)',
                      '& .MuiOutlinedInput-notchedOutline': {
                        borderColor: 'var(--neutral-200)',
                      },
                    },
                  }}
                />
              }
            />
            {/* Action buttons — attempt + tick (order matches queue control bar) */}

            <div className={styles.tickBarButtons}>
              <TickButtonWithLabel label={t('playView.tickBar.attemptLabel')}>
                <IconButton
                  onClick={(e) => quickTickBarRef.current?.saveAttempt(e.currentTarget)}
                  sx={{
                    backgroundColor: themeTokens.colors.errorMuted,
                    color: themeTokens.colors.error,
                    '&:hover': { backgroundColor: themeTokens.colors.errorMutedHover },
                  }}
                  aria-label={t('playView.tickBar.logAttemptAria')}
                >
                  <PersonFallingIcon />
                </IconButton>
              </TickButtonWithLabel>
              <TickButtonWithLabel label={isFlash ? 'flash' : 'tick'}>
                <IconButton
                  id="button-tick"
                  onClick={(e) => quickTickBarRef.current?.save(e.currentTarget)}
                  sx={{
                    backgroundColor: isFlash ? themeTokens.colors.amber : themeTokens.colors.success,
                    color: isFlash ? themeTokens.neutral[900] : 'common.white',
                    transition: 'background-color 150ms ease, color 150ms ease',
                    '&:hover': {
                      backgroundColor: isFlash ? themeTokens.colors.amber : themeTokens.colors.successHover,
                    },
                  }}
                  aria-label={t('playView.tickBar.saveTickAria')}
                >
                  <TickIcon isFlash={!!isFlash} />
                </IconButton>
              </TickButtonWithLabel>
            </div>
          </>
        )}
      </div>
    </div>
  );
});
PlayViewTickBar.displayName = 'PlayViewTickBar';

type PlayViewDrawerProps = {
  activeDrawer: ActiveDrawer;
  setActiveDrawer: (drawer: ActiveDrawer) => void;
  boardDetails: BoardDetails;
  angle: Angle;
  /** Callback to expose the MUI Paper element for external animation (e.g., peek hint). */
  onPaperRef?: (el: HTMLDivElement | null) => void;
  /** Drawer-local "displayed climb" — set by browse callers in a party
   *  session so the drawer can preview a climb without mutating the wall
   *  climb. Null in solo or when the drawer was opened from the bar (then
   *  the drawer displays the wall climb directly). */
  drawerDisplayedItem?: ClimbQueueItem | null;
  setDrawerDisplayedItem?: (item: ClimbQueueItem | null) => void;
  /** Wall-view mode (queue-control-bar pivot Phase 3). When true the drawer
   *  was opened from the bar body and renders in a read-only navigation
   *  state: hides prev/next, disables swipe, shows the "Currently on the
   *  wall" header. The lightbulb and standard climb actions remain. */
  wallView?: boolean;
};

const PlayViewDrawer: React.FC<PlayViewDrawerProps> = ({
  activeDrawer,
  setActiveDrawer,
  boardDetails,
  angle,
  onPaperRef,
  drawerDisplayedItem = null,
  setDrawerDisplayedItem,
  wallView = false,
}) => {
  const { t } = useTranslation('session');
  const isOpen = activeDrawer === 'play';
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  const [isQueueOpen, setIsQueueOpen] = useState(false);
  const [queueMounted, setQueueMounted] = useState(false);
  /**
   * True while the nested queue is being opened by the onboarding tour — read
   * at `QueueDrawer` mount time to seed `initialShowHistory`. Kept as a ref
   * rather than state because it only needs to be consumed once per mount and
   * must be synchronously up-to-date with the open handler.
   */
  const queueOpenedByTourRef = useRef(false);
  const [isPlaylistSelectorOpen, setIsPlaylistSelectorOpen] = useState(false);
  const [isTickBarActive, setIsTickBarActive] = useState(false);
  const [isBoardZoomed, setIsBoardZoomed] = useState(false);
  // Light-control drawer (disco / glyphs / palette / manual BLE disconnect).
  // Opened by long-pressing the action bar's lightbulb — the ShareBoardButton
  // that used to host the long-press is gone (pivot simplification: one
  // lightbulb in the drawer). Mount lazily — keeps the disco/glyph effects
  // out of the initial render path for users who never use them.
  const [lightDrawerOpen, setLightDrawerOpen] = useState(false);
  const [hasOpenedLightDrawer, setHasOpenedLightDrawer] = useState(false);
  const handleOpenLightDrawer = useCallback(() => {
    setHasOpenedLightDrawer(true);
    setLightDrawerOpen(true);
  }, []);
  const handleCloseLightDrawer = useCallback(() => setLightDrawerOpen(false), []);

  useEffect(() => {
    const scrollContainer = playPaperRef.current?.querySelector('[data-scroll-container]') as HTMLElement | null;
    if (!scrollContainer) return;
    scrollContainer.style.overflowY = isBoardZoomed ? 'hidden' : '';
  }, [isBoardZoomed, isOpen]);

  const playPaperRef = useRef<HTMLDivElement | null>(null);
  const combinedPaperRef = useCallback(
    (el: HTMLDivElement | null) => {
      playPaperRef.current = el;
      onPaperRef?.(el);
    },
    [onPaperRef],
  );

  // Custom swipe-to-close for nested disablePortal drawers (actions + playlist)
  const handleCloseActions = useCallback(() => setIsActionsOpen(false), []);

  // Actions drawer drag-to-resize
  const { paperRef: actionsPaperRef, dragHandlers: actionsDragHandlers } = useDrawerDragResize({
    open: isActionsOpen,
    onClose: handleCloseActions,
  });

  const pathname = usePathname();
  const { showMessage } = useSnackbar();

  const { logbook } = useBoardProvider();

  const currentClimbData = useCurrentClimb();
  const queueListData = useQueueList();
  const sessionData = useSessionData();

  const deferredCurrentClimb = useDeferredValue(currentClimbData);
  const deferredQueue = useDeferredValue(queueListData);
  const deferredSession = useDeferredValue(sessionData);

  const { currentClimbQueueItem } = isOpen ? currentClimbData : deferredCurrentClimb;
  const { queue } = isOpen ? queueListData : deferredQueue;
  const { viewOnlyMode, isPersistentSessionActive, isDriver, lastConnectedBoardSerial } = isOpen
    ? sessionData
    : deferredSession;
  const {
    mirrorClimb,
    getNextClimbQueueItem,
    getPreviousClimbQueueItem,
    setCurrentClimbQueueItem,
    takeControl,
    releaseControl,
  } = useQueueActions();
  const { isConnected: isBluetoothConnected, isBluetoothSupported, connect: bluetoothConnect } = useBluetoothContext();

  // In a party session, the drawer-local `drawerDisplayedItem` (set by browse
  // callers via the open-drawer event payload) takes precedence over the wall
  // climb, so browsing previews without yanking the wall. In solo (or when
  // opened from the bar with no payload), drawerDisplayedItem is null and the
  // drawer displays the wall climb directly — matching today's behavior.
  const effectiveItem = drawerDisplayedItem ?? currentClimbQueueItem;
  const currentClimb = effectiveItem?.climb ?? null;

  const { handleDoubleTap, showHeart, dismissHeart, isFavorited, toggleFavorite } = useDoubleTapFavorite({
    climbUuid: currentClimb?.uuid ?? '',
  });

  // currentQueueIndex / remainingQueueCount stay anchored on the wall climb
  // (currentClimbQueueItem). The drawer-local preview doesn't represent
  // progress through the shared queue — the wall climb does.
  const currentQueueIndex = currentClimbQueueItem
    ? queue.findIndex((item) => item.uuid === currentClimbQueueItem.uuid)
    : -1;
  const remainingQueueCount = currentQueueIndex >= 0 ? queue.length - currentQueueIndex : queue.length;

  useWakeLock(isOpen);

  // Hash-based back button support
  useEffect(() => {
    if (!isOpen) return;

    window.history.pushState(null, '', '#playing');

    const handlePopState = () => {
      setActiveDrawer('none');
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      if (window.location.hash === '#playing') {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    };
  }, [isOpen, setActiveDrawer]);

  const handleClose = useCallback(() => {
    if (isActionsOpen || isQueueOpen || isPlaylistSelectorOpen) return;
    setDrawerOpen(false);
    setActiveDrawer('none');
    if (window.location.hash === '#playing') {
      window.history.back();
    }
  }, [setActiveDrawer, isActionsOpen, isQueueOpen, isPlaylistSelectorOpen]);

  // Compute ascent info for tick FAB badge
  const currentAngle = typeof angle === 'string' ? parseInt(angle, 10) : angle;
  const filteredLogbook = useMemo(() => {
    if (!logbook || !currentClimb) return [];
    return logbook.filter((asc) => asc.climb_uuid === currentClimb.uuid && Number(asc.angle) === currentAngle);
  }, [logbook, currentClimb, currentAngle]);

  const hasSuccessfulAscent = filteredLogbook.some((asc) => asc.is_ascent);
  const ascentCount = filteredLogbook.length;

  // Card-swipe navigation. In an active party session, prev/next walks the
  // drawer-local preview state without broadcasting (browse-doesn't-yank). In
  // solo, it mutates the wall climb like today so BLE keeps sending.
  //
  // Non-driver swipe (party + isDriver===false): walks the suggested-climbs
  // feed only — skip the shared queue, which is "the climbs the driver
  // committed to" and not a non-driver's preview surface (pivot rule 5).
  // Drivers (and solo, where isDriver is always true) get the existing
  // queue → suggestions fall-through.
  const navigateFromItem = effectiveItem ?? null;
  const swipeSuggestionsOnly = isPersistentSessionActive && !isDriver;
  const nextItem = getNextClimbQueueItem({ from: navigateFromItem, suggestionsOnly: swipeSuggestionsOnly });
  const prevItem = getPreviousClimbQueueItem({ from: navigateFromItem, suggestionsOnly: swipeSuggestionsOnly });

  // The pivot's preview-vs-broadcast fork: in party, non-drivers preview
  // (drawer-local state, no wall change); drivers broadcast (wall climb +
  // BLE send). Solo always broadcasts. Phase 1 routed every party tap to
  // preview; PR3 narrows that to "party AND not driving" so driver
  // gestures inside the drawer (swipe, prev/next) walk the queue/
  // suggestions and update the wall as the spec requires.
  const advanceTo = useCallback(
    (item: ClimbQueueItem, method: string, direction: 'next' | 'previous') => {
      if (isPersistentSessionActive && !isDriver) {
        setDrawerDisplayedItem?.(item);
        track('Queue Navigation', { direction, method, mode: 'preview' });
      } else {
        // Broadcast path: clear any lingering drawer-local preview so the
        // drawer's `effectiveItem = drawerDisplayedItem ?? wallClimb`
        // fall-through reads the freshly-broadcast wall climb instead of a
        // stale preview from before the user became driver.
        setDrawerDisplayedItem?.(null);
        setCurrentClimbQueueItem(item);
        track('Queue Navigation', { direction, method, mode: 'broadcast' });
      }
    },
    [isPersistentSessionActive, isDriver, setCurrentClimbQueueItem, setDrawerDisplayedItem],
  );

  const navigate = useCallback(
    (direction: 'next' | 'previous', source: 'swipePlayViewDrawer' | 'playViewDrawer') => {
      const getter = direction === 'next' ? getNextClimbQueueItem : getPreviousClimbQueueItem;
      const item = getter({ from: navigateFromItem, suggestionsOnly: swipeSuggestionsOnly });
      if (!item || viewOnlyMode) return;
      advanceTo(item, source, direction);
    },
    [getNextClimbQueueItem, getPreviousClimbQueueItem, navigateFromItem, swipeSuggestionsOnly, viewOnlyMode, advanceTo],
  );

  const handleSwipeNext = useCallback(() => navigate('next', 'swipePlayViewDrawer'), [navigate]);
  const handleSwipePrevious = useCallback(() => navigate('previous', 'swipePlayViewDrawer'), [navigate]);

  // Wall-view mode is a read-only display of the wall climb — disable swipe
  // navigation entirely. The drawer is anchored to whatever is on the wall;
  // to browse other climbs the user closes the drawer and uses the list.
  const canSwipeNext = !viewOnlyMode && !wallView && !!nextItem;
  const canSwipePrevious = !viewOnlyMode && !wallView && !!prevItem;

  // Tick FAB → inline tick bar
  const handleTickFabClick = useCallback(() => {
    setIsActionsOpen(false);
    setIsTickBarActive(true);
  }, []);

  const handleTickBarClose = useCallback(() => {
    setIsTickBarActive(false);
  }, []);

  // Reset tick bar when the climb changes so it doesn't stay open for the wrong climb
  useEffect(() => {
    setIsTickBarActive(false);
  }, [currentClimb?.uuid]);

  const handleTickBarError = useCallback(() => {
    showMessage(t('playView.tickError'), 'error');
  }, [showMessage, t]);

  const handlePrevNavClick = useCallback(() => navigate('previous', 'playViewDrawer'), [navigate]);
  // Wall-confirm watcher: armed by handleLightbulbClick, dismissed by the
  // local wall-confirm bus or fires a connect fallback after 2 s. Owns its
  // own unmount cleanup so the drawer doesn't need to thread that wiring.
  const { armWatcher: armWallConfirmWatcher, cancelWatcher: cancelWallConfirmWatcher } = useWallConfirmFallback({
    isBluetoothConnected,
    isBluetoothSupported,
    lastConnectedBoardSerial,
    bluetoothConnect,
  });

  /**
   * Lightbulb press: toggle the driver role.
   *
   * - When the local user is NOT driving, press takes control via
   *   `takeControl(currentClimb)` and arms the 2-second wall-confirm
   *   watcher. While driving, every subsequent prev/next/swipe broadcasts
   *   (per the advanceTo driver fork) and the AutoSender forwards each
   *   climb change to the wall — so the lit lightbulb means "I'm driving;
   *   the wall follows what I do."
   *
   * - When the local user IS already driving, press releases via
   *   `releaseControl()`. The lightbulb darkens; subsequent prev/next/
   *   swipe go back to preview-only.
   *
   * Watcher fallbacks (only on the take-control branch):
   *  - Already BLE-connected → trust the AutoSender's in-flight write.
   *  - Stored session board serial + native shell → auto-connect.
   *  - Otherwise → connect() which opens the device picker dialog.
   */
  const handleLightbulbClick = useCallback(() => {
    // Party + driver: release control (give the wall away). Cancel any
    // in-flight watcher so the fallback doesn't fire after the role is
    // already released.
    if (isPersistentSessionActive && isDriver) {
      cancelWallConfirmWatcher();
      void releaseControl();
      track('Wall Control Released', {
        reason: 'manual',
        mode: 'party',
        boardLayout: boardDetails.layout_name ?? '',
      });
      return;
    }
    // Solo: BLE-centric — the lightbulb's filled state means "a board is
    // paired." Tap when not paired opens the picker directly (no 2s watcher
    // needed; there's no other device that might emit a wall-confirm).
    // Tap when paired re-sends the current climb so the user can retry a
    // missed write without long-pressing into the light-control drawer.
    if (!isPersistentSessionActive) {
      if (!isBluetoothConnected) {
        track('Wall Control Taken', {
          source: 'lightbulb_drawer',
          mode: 'solo',
          climbUuid: currentClimb?.uuid ?? null,
        });
        void bluetoothConnect();
        return;
      }
      if (!currentClimb) return;
      void takeControl(currentClimb);
      setDrawerDisplayedItem?.(null);
      track('Wall Control Taken', {
        source: 'lightbulb_drawer',
        mode: 'solo',
        climbUuid: currentClimb.uuid,
      });
      return;
    }
    // Party + non-driver: take + arm the 2s wall-confirm watcher. The
    // watcher fires the picker fallback if no BLE-paired peer emits a
    // confirmation in time — exactly what the pivot's lightbulb is for.
    if (!currentClimb) return;
    void takeControl(currentClimb);
    setDrawerDisplayedItem?.(null);
    track('Wall Control Taken', {
      source: 'lightbulb_drawer',
      previousDriver: 'other',
      mode: 'party',
      climbUuid: currentClimb.uuid,
    });
    armWallConfirmWatcher({
      climbUuid: currentClimb.uuid,
      mode: 'party',
      boardLayout: boardDetails.layout_name ?? '',
    });
  }, [
    currentClimb,
    takeControl,
    releaseControl,
    setDrawerDisplayedItem,
    isDriver,
    isPersistentSessionActive,
    isBluetoothConnected,
    bluetoothConnect,
    armWallConfirmWatcher,
    cancelWallConfirmWatcher,
    boardDetails.layout_name,
  ]);
  const handleNextNavClick = useCallback(() => navigate('next', 'playViewDrawer'), [navigate]);
  const handleOpenActionsMenu = useCallback(() => {
    setIsQueueOpen(false);
    setIsPlaylistSelectorOpen(false);
    setIsActionsOpen(true);
  }, []);
  const handleOpenQueueDrawer = useCallback(() => {
    setIsActionsOpen(false);
    setIsPlaylistSelectorOpen(false);
    setQueueMounted(true);
    setIsQueueOpen(true);
  }, []);

  const isMirrored = !!currentClimb?.mirrored;

  // Go to queue from actions drawer
  const handleGoToQueueFromActions = useCallback(() => {
    handleCloseActions();
    handleOpenQueueDrawer();
  }, [handleCloseActions, handleOpenQueueDrawer]);

  const handleClosePlaylist = useCallback(() => setIsPlaylistSelectorOpen(false), []);
  const playlistSwipe = useNestedDrawerSwipe(handleClosePlaylist);

  // Queue drawer callbacks
  const handleCloseQueueDrawer = useCallback(() => {
    setIsQueueOpen(false);
  }, []);
  const handleQueueTransitionEnd = useCallback(
    (open: boolean) => {
      if (!open && !isQueueOpen) {
        setQueueMounted(false);
      }
    },
    [isQueueOpen],
  );

  useEffect(() => {
    const handler = () => setIsQueueOpen(false);
    window.addEventListener(PLAY_DRAWER_EVENT, handler);
    return () => window.removeEventListener(PLAY_DRAWER_EVENT, handler);
  }, []);

  // Tour hooks: allow the onboarding tour to open/close the nested queue
  // drawer without the user having to find the button.
  useEffect(() => {
    const openHandler = () => {
      queueOpenedByTourRef.current = true;
      setIsActionsOpen(false);
      setIsPlaylistSelectorOpen(false);
      setQueueMounted(true);
      setIsQueueOpen(true);
    };
    const closeHandler = () => {
      queueOpenedByTourRef.current = false;
      setIsQueueOpen(false);
    };
    window.addEventListener(TOUR_OPEN_PLAY_QUEUE_EVENT, openHandler);
    window.addEventListener(TOUR_CLOSE_PLAY_QUEUE_EVENT, closeHandler);
    return () => {
      window.removeEventListener(TOUR_OPEN_PLAY_QUEUE_EVENT, openHandler);
      window.removeEventListener(TOUR_CLOSE_PLAY_QUEUE_EVENT, closeHandler);
    };
  }, []);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const openRafRef = useRef<number>(0);
  const hasBeenMountedRef = useRef(false);

  const [contentReady, setContentReady] = useState(false);
  useEffect(() => {
    const setReady = () => {
      setContentReady(true);
      hasBeenMountedRef.current = true;
    };
    const w = window as WindowWithIdleCallback;
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(setReady, { timeout: 500 });
      return () => window.cancelIdleCallback(id);
    }
    const id = requestAnimationFrame(setReady);
    return () => cancelAnimationFrame(id);
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) {
      cancelAnimationFrame(openRafRef.current);
      setDrawerOpen(false);
      setQueueMounted(false);
      setIsQueueOpen(false);
      setIsActionsOpen(false);
      setIsTickBarActive(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      if (playPaperRef.current) {
        playPaperRef.current.style.transform = '';
        playPaperRef.current.style.transition = '';
      }
      setContentReady(true);
      if (hasBeenMountedRef.current) {
        setDrawerOpen(true);
      } else {
        hasBeenMountedRef.current = true;
        openRafRef.current = requestAnimationFrame(() => {
          setDrawerOpen(true);
        });
      }
    }
    return () => cancelAnimationFrame(openRafRef.current);
  }, [isOpen]);

  const [sectionsEverEnabled, setSectionsEverEnabled] = useState(false);
  const handleTransitionEnd = useCallback((open: boolean) => {
    if (open) setSectionsEverEnabled(true);
  }, []);

  const currentFrames = currentClimb?.frames;
  const currentMirrored = currentClimb?.mirrored;
  useEffect(() => {
    if (currentClimb) {
      renderBoard({
        boardDetails,
        frames: currentClimb.frames,
        mirrored: !!currentClimb.mirrored,
      }).catch((e: unknown) => {
        if (process.env.NODE_ENV === 'development') console.info('Pre-warm render failed:', e);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see comment above
  }, [currentFrames, currentMirrored, boardDetails]);

  const handleBoardPullClose = useCallback(() => {
    setDrawerOpen(false);
    setActiveDrawer('none');
    if (window.location.hash === '#playing') {
      window.history.back();
    }
  }, [setActiveDrawer]);

  const boardPull = usePullToClose({
    paperEl: playPaperRef.current,
    onClose: handleBoardPullClose,
    deadZone: 60,
    closeThreshold: 70,
    trackPullOrigin: true,
    offsetByDeadZone: true,
  });

  const handleBoardTouchStart = useCallback(
    (e: React.TouchEvent) => {
      (e.nativeEvent as unknown as Record<string, unknown>).defaultMuiPrevented = true;

      const scrollContainer = findScrollContainer(e.target as HTMLElement);
      const y = e.touches[0].clientY;
      boardPull.onTouchStart(y, scrollContainer);

      if (scrollContainer && scrollContainer.scrollTop <= 0) {
        boardPull.stateRef.current.pullOriginY = y;
      }
    },
    [boardPull],
  );

  const handleBoardTouchMove = useCallback(
    (e: React.TouchEvent) => {
      boardPull.onTouchMove(e.touches[0].clientY, e.touches.length, isBoardZoomed);
    },
    [boardPull, isBoardZoomed],
  );

  const handleBoardTouchEnd = useCallback(() => {
    boardPull.onTouchEnd();
  }, [boardPull]);

  const aboveFold = useMemo(() => {
    if (!currentClimb) return null;
    return (
      <>
        {wallView && (
          // Wall-view banner (pivot Phase 3): makes the mode unambiguous when
          // the user tapped the bar body.
          <Box
            sx={{
              px: 2,
              py: 1,
              fontSize: 13,
              fontWeight: 500,
              color: themeTokens.colors.primary,
              textAlign: 'center',
            }}
          >
            {t('playView.wallViewHeader')}
          </Box>
        )}
        {/* Header: Grade | Name */}
        <div className={styles.headerSection}>
          <ClimbDetailHeader climb={currentClimb} />
        </div>

        {/* Board renderer with card-swipe and floating Tick FAB */}
        <div className={styles.boardSectionWrapper}>
          {currentClimb && (
            <SwipeBoardCarousel
              boardDetails={boardDetails}
              currentClimb={currentClimb}
              nextClimb={nextItem?.climb}
              previousClimb={prevItem?.climb}
              onSwipeNext={handleSwipeNext}
              onSwipePrevious={handleSwipePrevious}
              canSwipeNext={canSwipeNext}
              canSwipePrevious={canSwipePrevious}
              className={styles.boardSection}
              boardContainerClassName={styles.swipeCardContainer}
              fillContainer
              onDoubleTap={handleDoubleTap}
              showZoomHint
              isDrawerOpen={isOpen}
              onZoomChange={setIsBoardZoomed}
              overlay={<HeartAnimationOverlay visible={showHeart} onAnimationEnd={dismissHeart} />}
            />
          )}

          {/* Floating Tick FAB - hides when tick bar is active */}
          {isOpen && (
            <div className={styles.tickFabContainer}>
              <button
                className={`${styles.tickFab} ${hasSuccessfulAscent ? styles.tickFabSuccess : ''} ${isTickBarActive ? styles.tickFabHiding : ''}`}
                onClick={handleTickFabClick}
                aria-label={t('playView.tickFab.logAscentAria')}
                disabled={isTickBarActive}
              >
                <CheckOutlined className={styles.tickFabIcon} />
                {ascentCount > 0 && <span className={styles.tickFabBadge}>{ascentCount}</span>}
              </button>
            </div>
          )}

          {/* Tick bar backdrop overlay */}
          {isOpen && (
            <div
              className={`${styles.tickBarOverlay} ${isTickBarActive ? styles.tickBarOverlayActive : ''}`}
              onClick={handleTickBarClose}
              aria-hidden="true"
            />
          )}

          {/* Floating tick bar — overlays bottom of board section, no reflow */}
          {isOpen && currentClimb && (
            <PlayViewTickBar
              isTickBarActive={isTickBarActive}
              currentClimb={currentClimb}
              angle={angle}
              boardDetails={boardDetails}
              onClose={handleTickBarClose}
              onError={handleTickBarError}
            />
          )}
        </div>

        {/* Action bar */}
        {isOpen && (
          <PlayViewActionBar
            canSwipePrevious={canSwipePrevious}
            canSwipeNext={canSwipeNext}
            isMirrored={isMirrored}
            supportsMirroring={!!boardDetails.supportsMirroring}
            isFavorited={isFavorited}
            remainingQueueCount={remainingQueueCount}
            onPrevClick={handlePrevNavClick}
            onNextClick={handleNextNavClick}
            onMirror={mirrorClimb}
            onToggleFavorite={toggleFavorite}
            onOpenActions={handleOpenActionsMenu}
            onOpenQueue={handleOpenQueueDrawer}
            lightbulbActive={isPersistentSessionActive ? isDriver : isBluetoothConnected}
            displayedClimbName={currentClimb?.name ?? null}
            onLightbulb={handleLightbulbClick}
            onLightbulbLongPress={handleOpenLightDrawer}
            wallView={wallView}
            angleSelector={
              <AngleSelector
                boardName={boardDetails.board_name}
                boardDetails={boardDetails}
                currentAngle={currentAngle}
                currentClimb={currentClimb}
                isAngleAdjustable
              />
            }
          />
        )}
      </>
    );
  }, [
    currentClimb,
    boardDetails,
    currentAngle,
    nextItem,
    prevItem,
    handleSwipeNext,
    handleSwipePrevious,
    canSwipeNext,
    canSwipePrevious,
    handleDoubleTap,
    showHeart,
    dismissHeart,
    isOpen,
    hasSuccessfulAscent,
    ascentCount,
    handleTickFabClick,
    isTickBarActive,
    isMirrored,
    isFavorited,
    remainingQueueCount,
    handlePrevNavClick,
    handleNextNavClick,
    mirrorClimb,
    toggleFavorite,
    handleOpenActionsMenu,
    handleOpenQueueDrawer,
    isDriver,
    handleLightbulbClick,
    handleOpenLightDrawer,
    wallView,
    angle,
    handleTickBarClose,
    handleTickBarError,
  ]);

  return (
    <SwipeableDrawer
      placement="bottom"
      height="100%"
      fullHeight
      open={drawerOpen}
      onClose={handleClose}
      onTransitionEnd={handleTransitionEnd}
      keepMounted
      paperRef={combinedPaperRef}
      swipeEnabled={!isActionsOpen && !isQueueOpen && !isPlaylistSelectorOpen}
      showDragHandle
      styles={{
        body: { padding: 0 },
        wrapper: { height: '100%', backgroundColor: 'var(--semantic-background)' },
      }}
    >
      {contentReady || isOpen ? (
        <>
          <IconButton
            size="small"
            onClick={handleClose}
            aria-label={t('playView.closeAria')}
            sx={{
              position: 'absolute',
              top: 8,
              right: 8,
              zIndex: 2,
              color: 'text.primary',
              backgroundColor: 'action.selected',
              '&:hover': { backgroundColor: 'action.focus' },
            }}
          >
            <CloseOutlined />
          </IconButton>
          <div
            className={styles.drawerContent}
            onTouchStart={handleBoardTouchStart}
            onTouchMove={handleBoardTouchMove}
            onTouchEnd={handleBoardTouchEnd}
          >
            {currentClimb ? (
              <PlayDrawerContent
                climb={currentClimb}
                boardType={boardDetails.board_name}
                angle={currentAngle}
                sectionsEnabled={sectionsEverEnabled && isOpen}
                aboveFold={aboveFold}
              />
            ) : (
              <ClimbDetailShellClient mode="play" sections={[]} aboveFold={null} />
            )}
          </div>

          {/* Climb actions drawer */}
          {isOpen && currentClimb && isActionsOpen && (
            <SwipeableDrawer
              placement="bottom"
              title={
                currentClimb ? (
                  <div data-swipe-blocked="" {...actionsDragHandlers} className={drawerCss.dragHeaderWrapper}>
                    <DrawerClimbHeader climb={currentClimb} boardDetails={boardDetails} />
                  </div>
                ) : undefined
              }
              height="60%"
              paperRef={actionsPaperRef}
              open={isActionsOpen}
              onClose={handleCloseActions}
              swipeEnabled={false}
              disablePortal
              styles={{
                wrapper: {
                  touchAction: 'pan-y' as const,
                  transition: 'height 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                },
                body: { padding: `${themeTokens.spacing[2]}px 0` },
              }}
            >
              <ClimbActions
                climb={currentClimb}
                boardDetails={boardDetails}
                angle={currentAngle}
                currentPathname={pathname}
                viewMode="list"
                onOpenPlaylistSelector={() => {
                  setIsActionsOpen(false);
                  setIsPlaylistSelectorOpen(true);
                }}
                onActionComplete={handleCloseActions}
                onGoToQueue={handleGoToQueueFromActions}
              />
            </SwipeableDrawer>
          )}

          {/* Playlist selector drawer */}
          {isOpen && currentClimb && isPlaylistSelectorOpen && (
            <SwipeableDrawer
              title={<DrawerClimbHeader climb={currentClimb} boardDetails={boardDetails} />}
              placement="bottom"
              open={isPlaylistSelectorOpen}
              onClose={handleClosePlaylist}
              paperRef={playlistSwipe.paperRef}
              swipeEnabled={false}
              disablePortal
              styles={{
                wrapper: { height: 'auto', maxHeight: '70vh' },
                body: { padding: 0 },
                header: {
                  paddingLeft: `${themeTokens.spacing[3]}px`,
                  paddingRight: `${themeTokens.spacing[3]}px`,
                },
              }}
            >
              <PlaylistSelectionContent
                climbUuid={currentClimb.uuid}
                boardDetails={boardDetails}
                angle={currentAngle}
                onDone={handleClosePlaylist}
              />
            </SwipeableDrawer>
          )}
        </>
      ) : null}

      {/* Queue list drawer */}
      {queueMounted && (
        <QueueDrawer
          open={isQueueOpen}
          onClose={handleCloseQueueDrawer}
          onTransitionEnd={handleQueueTransitionEnd}
          boardDetails={boardDetails}
          initialShowHistory={queueOpenedByTourRef.current}
        />
      )}
      {/* Light-control drawer — opened by long-pressing the action bar's
          lightbulb. Hosts disco/glyph light shows, palette customisation,
          and the manual BLE disconnect that the old ShareBoardButton
          used to own. Mounted lazily on first open. */}
      {hasOpenedLightDrawer && <LightControlDrawer open={lightDrawerOpen} onClose={handleCloseLightDrawer} />}
    </SwipeableDrawer>
  );
};

export default React.memo(PlayViewDrawer);
