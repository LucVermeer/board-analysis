'use client';

import React, { useMemo } from 'react';
import DashboardOutlined from '@mui/icons-material/DashboardOutlined';
import BluetoothOutlined from '@mui/icons-material/BluetoothOutlined';
import BoardRenderer from '../board-renderer/board-renderer';
import { useBoardDetails } from './board-thumbnail';
import { formatCount, formatSends } from '@/app/lib/format-climb-stats';
import type { BoardConfigData } from '@/app/lib/server-board-configs';
import type { StoredBoardConfig } from '@/app/lib/saved-boards-db';
import type { UserBoard, PopularBoardConfig } from '@boardsesh/shared-schema';
import styles from './board-scroll.module.css';

const BOARD_TYPE_LABELS: Record<string, string> = {
  kilter: 'Kilter',
  tension: 'Tension',
  moonboard: 'MoonBoard',
  decoy: 'Decoy',
  touchstone: 'Touchstone',
  grasshopper: 'Grasshopper',
  soill: 'So iLL',
};

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

type BoardScrollCardProps = {
  userBoard?: UserBoard;
  storedConfig?: StoredBoardConfig;
  popularConfig?: PopularBoardConfig;
  boardConfigs?: BoardConfigData;
  selected?: boolean;
  disabled?: boolean;
  disabledText?: string;
  distanceMeters?: number | null;
  bluetoothNearby?: boolean;
  size?: 'default' | 'small';
  onClick: () => void;
};

export default function BoardScrollCard({
  userBoard,
  storedConfig,
  popularConfig,
  boardConfigs,
  selected,
  disabled,
  disabledText,
  distanceMeters,
  bluetoothNearby,
  size = 'default',
  onClick,
}: BoardScrollCardProps) {
  const boardDetails = useBoardDetails(userBoard, storedConfig, popularConfig);

  const { name, meta } = useMemo(() => {
    let cardName = '';
    let cardMeta = '';

    if (userBoard) {
      cardName = userBoard.name;
      if (userBoard.distanceMeters != null) {
        // Nearby/discovered board — show type and location
        cardMeta = BOARD_TYPE_LABELS[userBoard.boardType] || userBoard.boardType;
        if (userBoard.locationName) {
          cardMeta += ` \u00B7 ${userBoard.locationName}`;
        }
      } else {
        cardMeta = formatSends(userBoard.totalAscents);
      }
    } else if (storedConfig) {
      cardName = storedConfig.name;
      if (boardConfigs) {
        const layouts = boardConfigs.layouts[storedConfig.board] || [];
        const layout = layouts.find((l) => l.id === storedConfig.layoutId);
        cardMeta = layout?.name || storedConfig.board.charAt(0).toUpperCase() + storedConfig.board.slice(1);
      } else {
        cardMeta = storedConfig.board.charAt(0).toUpperCase() + storedConfig.board.slice(1);
      }
      cardMeta += ` \u00B7 ${storedConfig.angle}\u00B0`;
    } else if (popularConfig) {
      cardName = popularConfig.displayName;
      const parts: string[] = [];
      if (popularConfig.boardCount > 0) parts.push(`${formatCount(popularConfig.boardCount)} boards`);
      parts.push(formatSends(popularConfig.totalAscents));
      cardMeta = parts.join(' \u00B7 ');
    }

    return { name: cardName, meta: cardMeta };
  }, [userBoard, storedConfig, popularConfig, boardConfigs]);

  const isSmall = size === 'small';
  const iconSize = isSmall ? 24 : 32;

  const handleClick = disabled ? undefined : onClick;
  const displayMeta = disabled && disabledText ? disabledText : meta;

  return (
    <div className={`${styles.cardScroll} ${isSmall ? styles.cardScrollSmall : ''}`} onClick={handleClick}>
      <div
        className={`${styles.cardSquare} ${selected ? styles.cardSquareSelected : ''} ${disabled ? styles.cardSquareDisabled : ''}`}
      >
        {boardDetails ? (
          <BoardRenderer mirrored={false} boardDetails={boardDetails} thumbnail fillHeight />
        ) : (
          <div className={styles.cardFallback}>
            <DashboardOutlined sx={{ fontSize: iconSize }} />
          </div>
        )}
        {distanceMeters != null && <div className={styles.distanceBadge}>{formatDistance(distanceMeters)}</div>}
        {bluetoothNearby && (
          <div className={`${styles.distanceBadge} ${styles.bluetoothBadge}`}>
            <BluetoothOutlined sx={{ fontSize: 14, verticalAlign: 'middle' }} />
          </div>
        )}
      </div>
      <div
        className={`${styles.cardName} ${selected ? styles.cardNameSelected : ''} ${disabled ? styles.cardNameDisabled : ''}`}
      >
        {name}
      </div>
      {displayMeta && (
        <div className={`${styles.cardMeta} ${disabled ? styles.cardNameDisabled : ''}`}>{displayMeta}</div>
      )}
    </div>
  );
}
