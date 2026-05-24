'use client';

import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import MuiBadge from '@mui/material/Badge';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import SyncOutlined from '@mui/icons-material/SyncOutlined';
import FavoriteBorderOutlined from '@mui/icons-material/FavoriteBorderOutlined';
import Favorite from '@mui/icons-material/Favorite';
import SkipPreviousOutlined from '@mui/icons-material/SkipPreviousOutlined';
import SkipNextOutlined from '@mui/icons-material/SkipNextOutlined';
import LightbulbOutlined from '@mui/icons-material/LightbulbOutlined';
import Lightbulb from '@mui/icons-material/Lightbulb';
import MoreHorizOutlined from '@mui/icons-material/MoreHorizOutlined';
import FormatListBulletedOutlined from '@mui/icons-material/FormatListBulletedOutlined';
import { useLongPress } from '@/app/lib/hooks/use-long-press';
import { themeTokens } from '@/app/theme/theme-config';
import styles from './play-view-drawer.module.css';

export type PlayViewActionBarProps = {
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
  /** Pulse the lightbulb while a take-control press is in flight. Set
   *  between the press and the matching `WallConfirmedClimb` event (or the
   *  2-second timeout fallback). Independent from `lightbulbActive`. */
  lightbulbPending?: boolean;
  /** Single-iteration pulse + tooltip on first drawer open. The parent
   *  reads `swipeHint:lightbulbSeen` from IndexedDB and toggles this true
   *  once, then writes the flag so subsequent opens skip the coachmark. */
  lightbulbCoachmark?: boolean;
  /** Localized tooltip copy for the coachmark. Threaded through so the
   *  parent owns the i18n call and this component stays presentational. */
  lightbulbCoachmarkText?: string;
  /** Fired when the coachmark animation runs once — the parent persists
   *  the seen flag and clears `lightbulbCoachmark`. */
  onLightbulbCoachmarkSeen?: () => void;
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
  lightbulbPending = false,
  lightbulbCoachmark = false,
  lightbulbCoachmarkText,
  onLightbulbCoachmarkSeen,
  displayedClimbName,
  onLightbulb,
  onLightbulbLongPress,
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
      <IconButton disabled={!canSwipePrevious} onClick={onPrevClick}>
        <SkipPreviousOutlined />
      </IconButton>
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
          glyphs / palette / manual disconnect).

          Pending / coachmark variants share a single CSS pulse class so the
          two states never compose into a janky doubled animation. */}
      <Tooltip
        // Coachmark tooltip only — once `lightbulbCoachmark` flips false the
        // tooltip is gone (default-closed Tooltip with no children-trigger).
        open={lightbulbCoachmark && !!lightbulbCoachmarkText}
        title={lightbulbCoachmarkText ?? ''}
        placement="top"
        arrow
        // Tooltip-only — the underlying button still owns its aria-label.
        disableInteractive
      >
        <IconButton
          ref={lightbulbLongPressRef}
          onClick={handleLightbulbTap}
          aria-label={lightbulbLabel}
          className={
            lightbulbPending ? styles.lightbulbPending : lightbulbCoachmark ? styles.lightbulbCoachmark : undefined
          }
          onAnimationEnd={lightbulbCoachmark ? onLightbulbCoachmarkSeen : undefined}
        >
          {lightbulbActive ? (
            <Lightbulb className={styles.lightbulbConnectedGlow} sx={{ color: themeTokens.colors.warning }} />
          ) : (
            <LightbulbOutlined />
          )}
        </IconButton>
      </Tooltip>
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
      <IconButton disabled={!canSwipeNext} onClick={onNextClick}>
        <SkipNextOutlined />
      </IconButton>
    </div>
  );
});
PlayViewActionBar.displayName = 'PlayViewActionBar';
