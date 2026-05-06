'use client';

import React, { useCallback } from 'react';
import { createPortal } from 'react-dom';
import Fab from '@mui/material/Fab';
import Badge from '@mui/material/Badge';
import LightbulbOutlined from '@mui/icons-material/LightbulbOutlined';
import FormatListBulletedOutlined from '@mui/icons-material/FormatListBulletedOutlined';
import type { BoardDetails, Climb } from '@/app/lib/types';
import ClimbThumbnail from '../climb-card/climb-thumbnail';
import { TickIcon } from '../logbook/tick-icon';
import { useBluetoothContext } from '../board-bluetooth-control/bluetooth-context';
import { useGradeFormat } from '@/app/hooks/use-grade-format';
import { useIsDarkMode } from '@/app/hooks/use-is-dark-mode';
import { getGradeTintColor } from '@/app/lib/grade-colors';
import { themeTokens } from '@/app/theme/theme-config';
import styles from './queue-control-fab.module.css';

export type QueueControlFabMode = 'minimised' | 'peeking' | 'hidden';

type QueueControlFabProps = {
  mode: QueueControlFabMode;
  currentClimb: Climb | null;
  boardDetails: BoardDetails;
  pathname: string;
  /** Number of items in the queue, shown as a badge on the queue FAB. */
  queueSize: number;
  /** Tap on the grade FAB — expand the queue control bar. */
  onExpandFromGrade: () => void;
  /** Tap on the climb thumbnail FAB — open the play view drawer. */
  onOpenPlayView: () => void;
  onExpandFromTick: () => void;
  /** Open the queue drawer. */
  onExpandFromQueue: () => void;
};

const QueueControlFab: React.FC<QueueControlFabProps> = ({
  mode,
  currentClimb,
  boardDetails,
  pathname,
  queueSize,
  onExpandFromGrade,
  onOpenPlayView,
  onExpandFromTick,
  onExpandFromQueue,
}) => {
  const { formatGrade, getGradeColor, loaded: gradeLoaded } = useGradeFormat();
  const isDark = useIsDarkMode();
  const { isConnected: isBluetoothConnected, connect } = useBluetoothContext();

  const handleConnectBluetooth = useCallback(() => {
    void connect();
  }, [connect]);

  if (typeof document === 'undefined') return null;
  if (!currentClimb) return null;

  const isPeeking = mode === 'peeking';
  const isVisible = mode !== 'hidden';
  const sourceGrade = currentClimb.difficulty;
  const formattedGrade = gradeLoaded ? formatGrade(sourceGrade) : null;
  const gradeColor = formattedGrade ? getGradeColor(sourceGrade, isDark) : undefined;
  // Use the 'session' variant for a more saturated, opaque background than
  // the default queue-bar tint — the FAB needs to read clearly against the
  // page rather than fade into it.
  const gradeTintColor = getGradeTintColor(sourceGrade, 'session', isDark);
  const fabBackground = gradeTintColor ?? 'var(--semantic-surface)';
  const showBluetoothFab = !isBluetoothConnected;

  // Liquid glass shared styling: very-light translucent backdrop with strong
  // blur + saturation, subtle inner highlight border, soft drop shadow.
  // The non-climb FABs share this base so the cluster reads as a glass pane;
  // the climb FAB gets a colorized tint on top of the same blur.
  const glassBg = isDark ? 'rgba(28, 28, 30, 0.42)' : 'rgba(255, 255, 255, 0.42)';
  const glassBgHover = isDark ? 'rgba(28, 28, 30, 0.62)' : 'rgba(255, 255, 255, 0.62)';
  const liquidGlass = {
    backdropFilter: 'blur(20px) saturate(200%)',
    WebkitBackdropFilter: 'blur(20px) saturate(200%)',
    border: '1px solid rgba(255, 255, 255, 0.28)',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.32)',
  } as const;

  // FABs share the same translucent backdrop and only differ by their icon
  // tint, so the cluster reads as a unified glass pane. Sized at 46×46 —
  // a touch larger than MUI's `small` default so the icon has room without
  // dominating next to the 84px climb FAB.
  const SMALL_FAB_SIZE = 46;
  const glassFab = (iconColor: string) =>
    ({
      ...liquidGlass,
      width: SMALL_FAB_SIZE,
      height: SMALL_FAB_SIZE,
      minHeight: SMALL_FAB_SIZE,
      backgroundColor: glassBg,
      color: iconColor,
      '&:hover': { backgroundColor: glassBgHover },
    }) as const;

  // Thumbnail FAB is a fixed 84px pill — climb info no longer lives inside
  // the FAB during peek; instead a separate snackbar fades in above the
  // smaller FABs to surface the climb name + byline.
  const thumbnailFabSx = {
    ...liquidGlass,
    width: 84,
    minWidth: 84,
    height: 84,
    minHeight: 84,
    borderRadius: '42px',
    padding: 0,
    overflow: 'hidden',
    backgroundColor: fabBackground,
    color: 'text.primary',
    transition: 'background-color 220ms ease-out',
    '&:hover': { backgroundColor: fabBackground },
  };

  // Non-climb FABs: shared translucent glass background, icon-only color
  // signal (no full-width tint). The climb FAB keeps the colorized tint
  // because the climb image lives inside it and needs the colour cue.
  const tickFabSx = glassFab(themeTokens.colors.success);
  const bluetoothFabSx = glassFab(themeTokens.colors.warning);
  const queueFabSx = glassFab(isDark ? '#fff' : themeTokens.neutral[800]);
  const gradeFabSx = {
    ...glassFab(gradeColor ?? (isDark ? '#fff' : themeTokens.neutral[800])),
    fontWeight: themeTokens.typography.fontWeight.bold,
    fontSize: themeTokens.typography.fontSize.xs,
    textTransform: 'none',
    alignSelf: 'flex-end',
  } as const;

  const queueBadgeSx = {
    '& .MuiBadge-badge': {
      ...themeTokens.badge.small,
      backgroundColor: themeTokens.colors.primary,
      color: 'common.white',
    },
  } as const;

  return createPortal(
    <>
      <div
        className={`${styles.fabRoot} ${isVisible ? styles.fabRootVisible : ''}`}
        data-testid="queue-control-fab"
        aria-hidden={!isVisible}
      >
        <div className={styles.leftCluster}>
          <Fab
            aria-label="Open climb details"
            onClick={onOpenPlayView}
            className={styles.thumbnailFab}
            sx={thumbnailFabSx}
            disableRipple
          >
            <span className={styles.thumbnailWrapper}>
              <ClimbThumbnail
                boardDetails={boardDetails}
                currentClimb={currentClimb}
                pathname={pathname}
                maxHeight="72px"
              />
            </span>
          </Fab>
          {formattedGrade && (
            <Fab
              aria-label="Expand queue control"
              onClick={onExpandFromGrade}
              className={styles.gradeFab}
              sx={gradeFabSx}
            >
              {formattedGrade}
            </Fab>
          )}
        </div>
        <div className={styles.rightCluster}>
          {showBluetoothFab && (
            <Fab
              aria-label="Connect to board"
              onClick={handleConnectBluetooth}
              className={styles.bluetoothFab}
              sx={bluetoothFabSx}
            >
              <LightbulbOutlined fontSize="small" />
            </Fab>
          )}
          <Badge badgeContent={queueSize} sx={queueBadgeSx} max={99} overlap="circular">
            <Fab aria-label="Open queue" onClick={onExpandFromQueue} className={styles.queueFab} sx={queueFabSx}>
              <FormatListBulletedOutlined fontSize="small" />
            </Fab>
          </Badge>
          <Fab aria-label="Save tick" onClick={onExpandFromTick} className={styles.tickFab} sx={tickFabSx}>
            <TickIcon isFlash={false} />
          </Fab>
        </div>
      </div>
      {/* Peek snackbar: pill shaped, colorized grade tint, surfaces the
          current climb's name + setter when it changes. Sibling of fabRoot
          (not inside it) because Safari has rendering bugs with position:
          absolute children of display: flex containers. The grade is
          already shown on the grade FAB so we omit it here. */}
      {isPeeking && (
        <div className={styles.peekSnackbar} style={{ backgroundColor: fabBackground }}>
          <span className={styles.peekName}>{currentClimb.name}</span>
          {currentClimb.setter_username && <span className={styles.peekByline}>By {currentClimb.setter_username}</span>}
        </div>
      )}
    </>,
    document.body,
  );
};

export default QueueControlFab;
