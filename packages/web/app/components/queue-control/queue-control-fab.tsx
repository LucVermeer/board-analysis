'use client';

import React, { useCallback } from 'react';
import { createPortal } from 'react-dom';
import Fab from '@mui/material/Fab';
import LightbulbOutlined from '@mui/icons-material/LightbulbOutlined';
import type { BoardDetails, Climb } from '@/app/lib/types';
import ClimbThumbnail from '../climb-card/climb-thumbnail';
import ClimbTitle from '../climb-card/climb-title';
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
  onExpandFromThumbnail: () => void;
  onExpandFromTick: () => void;
};

const QueueControlFab: React.FC<QueueControlFabProps> = ({
  mode,
  currentClimb,
  boardDetails,
  pathname,
  onExpandFromThumbnail,
  onExpandFromTick,
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

  // Thumbnail FAB is sized 30% larger than the standard 64px MUI Fab so the
  // climb stays readable at a glance while minimised. When peeking, the FAB
  // grows but stays inside its flex slot so the right cluster (tick + optional
  // bluetooth FAB) is never pushed off screen — flex-shrink lets it adapt on
  // narrow viewports while max-width caps growth on tablets.
  const thumbnailFabSx = {
    flexGrow: isPeeking ? 1 : 0,
    flexShrink: 1,
    flexBasis: isPeeking ? 364 : 84,
    minWidth: 84,
    maxWidth: isPeeking ? 364 : 84,
    height: 84,
    minHeight: 84,
    borderRadius: '42px',
    padding: 0,
    overflow: 'hidden',
    backgroundColor: fabBackground,
    color: 'text.primary',
    transition: 'flex-basis 220ms ease-out, max-width 220ms ease-out, background-color 220ms ease-out',
    justifyContent: 'flex-start',
    textTransform: 'none',
    '&:hover': { backgroundColor: fabBackground },
  };

  // Right-side FABs are de-emphasized (opacity .5, the nearest design token
  // to 40%) and use MUI's `small` size (40px ≈ 28% smaller than the default
  // 56px) so they don't compete with the larger thumbnail FAB.
  const tickFabSx = {
    backgroundColor: themeTokens.colors.success,
    color: 'common.white',
    opacity: themeTokens.opacity.subtle,
    '&:hover': { backgroundColor: themeTokens.colors.successHover, opacity: 1 },
  } as const;

  const bluetoothFabSx = {
    backgroundColor: themeTokens.colors.warning,
    color: 'common.white',
    opacity: themeTokens.opacity.subtle,
    '&:hover': { backgroundColor: themeTokens.colors.warningBg, opacity: 1 },
  } as const;

  return createPortal(
    <div
      className={`${styles.fabRoot} ${isVisible ? styles.fabRootVisible : ''}`}
      data-testid="queue-control-fab"
      aria-hidden={!isVisible}
    >
      <Fab
        aria-label="Expand queue control"
        onClick={onExpandFromThumbnail}
        className={`${styles.thumbnailFab} ${isPeeking ? styles.thumbnailFabPeeking : ''}`}
        sx={thumbnailFabSx}
        disableRipple
      >
        <span className={styles.thumbnailContent}>
          <span className={styles.thumbnailWrapper}>
            <ClimbThumbnail
              boardDetails={boardDetails}
              currentClimb={currentClimb}
              pathname={pathname}
              maxHeight="72px"
            />
            {formattedGrade && (
              <span className={styles.gradeChip} style={{ color: gradeColor ?? undefined }}>
                {formattedGrade}
              </span>
            )}
          </span>
          <span className={styles.peekText}>
            <ClimbTitle climb={currentClimb} showSetterInfo />
          </span>
        </span>
      </Fab>
      <div className={styles.rightCluster}>
        {showBluetoothFab && (
          <Fab
            size="small"
            aria-label="Connect to board"
            onClick={handleConnectBluetooth}
            className={styles.bluetoothFab}
            sx={bluetoothFabSx}
          >
            <LightbulbOutlined fontSize="small" />
          </Fab>
        )}
        <Fab size="small" aria-label="Save tick" onClick={onExpandFromTick} className={styles.tickFab} sx={tickFabSx}>
          <TickIcon isFlash={false} />
        </Fab>
      </div>
    </div>,
    document.body,
  );
};

export default QueueControlFab;
