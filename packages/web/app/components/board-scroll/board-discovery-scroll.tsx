'use client';

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useTranslation } from 'react-i18next';
import { useLocaleRouter } from '@/app/lib/i18n/use-locale-router';
import BoardScrollSection from './board-scroll-section';
import BoardScrollCard from './board-scroll-card';
import FindNearbyCard, { type FindNearbyStatus } from './find-nearby-card';
import CustomBoardCard from './custom-board-card';
import SearchBoardsCard from './search-boards-card';
import BluetoothQuickStartCard from './bluetooth-quick-start-card';
import BoardSearchDrawer from '../board-search-drawer/board-search-drawer';
import { useDiscoverBoards } from '@/app/hooks/use-discover-boards';
import { usePopularBoardConfigs } from '@/app/hooks/use-popular-board-configs';
import { useMyBoards } from '@/app/hooks/use-my-boards';
import { useBluetoothScan } from '@/app/hooks/use-bluetooth-scan';
import { parseSerialNumber } from '../board-bluetooth-control/bluetooth-aurora';
import type { UserBoard, PopularBoardConfig } from '@boardsesh/shared-schema';
import { constructBoardSlugListUrl } from '@/app/lib/url-utils';
import styles from './board-scroll.module.css';

function deriveFindNearbyStatus({
  locationEnabled,
  isLoading,
  error,
  hasLocation,
}: {
  locationEnabled: boolean;
  isLoading: boolean;
  error: string | null;
  hasLocation: boolean;
}): FindNearbyStatus {
  if (!locationEnabled) return 'idle';
  if (isLoading) return 'loading';
  if (error) return 'error';
  if (!hasLocation) return 'geo-denied';
  return 'no-results';
}

type BoardDiscoveryScrollProps = {
  onBoardClick: (board: UserBoard) => void;
  onConfigClick: (config: PopularBoardConfig) => void;
  onCustomClick: () => void;
  selectedBoardUuid?: string;
  initialPopularConfigs?: PopularBoardConfig[];
  /** Externally-provided boards to display inline (avoids double-fetch when parent already calls useMyBoards) */
  myBoards?: UserBoard[];
};

export default function BoardDiscoveryScroll({
  onBoardClick,
  onConfigClick,
  onCustomClick,
  selectedBoardUuid,
  initialPopularConfigs,
  myBoards: externalMyBoards,
}: BoardDiscoveryScrollProps) {
  const { t } = useTranslation('boards');
  const { status } = useSession();
  const isAuthenticated = status === 'authenticated';
  const router = useLocaleRouter();

  const [locationEnabled, setLocationEnabled] = useState(false);
  const [searchDrawerOpen, setSearchDrawerOpen] = useState(false);
  const {
    boards: discoverBoards,
    isLoading: isBoardsLoading,
    hasLocation,
    error: discoverError,
  } = useDiscoverBoards({ limit: 20, enableLocation: locationEnabled });

  const {
    configs: popularConfigs,
    isLoadingMore,
    hasMore,
    loadMore,
  } = usePopularBoardConfigs({ limit: 12, initialData: initialPopularConfigs });

  // Use externally-provided boards if available, otherwise fetch internally
  const { boards: internalMyBoards } = useMyBoards(externalMyBoards === undefined && isAuthenticated);
  const myBoards = externalMyBoards ?? internalMyBoards;
  const [myBoardsVisible, setMyBoardsVisible] = useState(false);

  // Bluetooth scan for quick start
  const { devices: bleDevices, resolvedBoards: bleResolvedBoards, status: bleStatus, startScan } = useBluetoothScan();

  // Build a set of serial numbers found nearby via BLE
  const bleSerialSet = useMemo(() => {
    const set = new Set<string>();
    for (const device of bleDevices) {
      const serial = parseSerialNumber(device.name);
      if (serial) set.add(serial);
    }
    return set;
  }, [bleDevices]);

  // Set of myBoard serial numbers so we can detect overlap
  const myBoardSerialSet = useMemo(() => {
    const set = new Set<string>();
    for (const board of myBoards) {
      if (board.serialNumber) set.add(board.serialNumber);
    }
    return set;
  }, [myBoards]);

  // BLE-resolved boards that are NOT already in myBoards — show as separate cards.
  // Only deliberately-saved entries are surfaced here; auto-recorded fallbacks
  // lack the social metadata the discovery card UI expects.
  const bleOnlyBoards = useMemo(
    () =>
      Array.from(bleResolvedBoards.values())
        .filter((entry) => entry.kind === 'saved')
        .map((entry) => entry.board)
        .filter((board) => !board.serialNumber || !myBoardSerialSet.has(board.serialNumber)),
    [bleResolvedBoards, myBoardSerialSet],
  );

  const [bleBoardsVisible, setBleBoardsVisible] = useState(false);

  useEffect(() => {
    if (myBoards.length > 0) {
      const id = requestAnimationFrame(() => setMyBoardsVisible(true));
      return () => cancelAnimationFrame(id);
    } else {
      setMyBoardsVisible(false);
    }
  }, [myBoards.length]);

  useEffect(() => {
    if (bleOnlyBoards.length > 0) {
      const id = requestAnimationFrame(() => setBleBoardsVisible(true));
      return () => cancelAnimationFrame(id);
    } else {
      setBleBoardsVisible(false);
    }
  }, [bleOnlyBoards.length]);

  const handleFindNearbyClick = useCallback(() => {
    setLocationEnabled(true);
  }, []);

  const handleSearchClick = useCallback(() => {
    setSearchDrawerOpen(true);
  }, []);

  const handleSearchDrawerClose = useCallback(() => {
    setSearchDrawerOpen(false);
  }, []);

  const handleSearchDrawerBoardClick = useCallback(
    (board: UserBoard) => {
      setSearchDrawerOpen(false);
      onBoardClick(board);
    },
    [onBoardClick],
  );

  const handleBluetoothClick = useCallback(() => {
    startScan();
  }, [startScan]);

  // Navigate to a BLE-discovered board with auto-connect serial param
  const handleBleBoardClick = useCallback(
    (board: UserBoard) => {
      if (board.serialNumber && board.slug) {
        router.push(
          constructBoardSlugListUrl(board.slug, board.angle) + `?autoConnect=${encodeURIComponent(board.serialNumber)}`,
        );
      } else {
        onBoardClick(board);
      }
    },
    [router, onBoardClick],
  );

  return (
    <>
      <BoardScrollSection
        title={t('discovery.section.nearby')}
        loading={isBoardsLoading && popularConfigs.length === 0 && myBoards.length === 0}
        onLoadMore={loadMore}
        hasMore={hasMore}
        isLoadingMore={isLoadingMore}
      >
        {/* Always-visible 2x2 mini-card cluster: Find Nearby + Search / Custom + Bluetooth */}
        <div className={styles.stackedCardsDouble}>
          <div className={styles.stackedCards}>
            <FindNearbyCard
              onClick={handleFindNearbyClick}
              status={deriveFindNearbyStatus({
                locationEnabled,
                isLoading: isBoardsLoading,
                error: discoverError,
                hasLocation,
              })}
              size="small"
            />
            <CustomBoardCard onClick={onCustomClick} size="small" />
          </div>
          <div className={styles.stackedCards}>
            <SearchBoardsCard onClick={handleSearchClick} size="small" />
            <BluetoothQuickStartCard
              onClick={handleBluetoothClick}
              status={bleStatus}
              hasResults={bleDevices.length > 0}
              size="small"
            />
          </div>
        </div>

        {/* Nearby boards (if any). LCP-priority preload for the first card
            comes from `<link rel="preload">` in the page-level server
            component (see `app/page.tsx`), not a per-card prop. */}
        {discoverBoards.map((board) => (
          <BoardScrollCard
            key={board.uuid}
            userBoard={board}
            selected={selectedBoardUuid === board.uuid}
            onClick={() => onBoardClick(board)}
          />
        ))}

        {/* BLE-discovered boards NOT already in myBoards - animate in. */}
        {bleOnlyBoards.map((board) => (
          <div
            key={`ble-${board.uuid}`}
            className={`${styles.myBoardCardFadeIn} ${bleBoardsVisible ? styles.myBoardCardFadeInVisible : ''}`}
          >
            <BoardScrollCard
              userBoard={board}
              selected={selectedBoardUuid === board.uuid}
              onClick={() => handleBleBoardClick(board)}
              bluetoothNearby
            />
          </div>
        ))}

        {/* My boards - animate in (opacity:0 → 1), show bluetooth badge if
            found nearby. */}
        {myBoards.map((board) => {
          const isBleNearby = !!board.serialNumber && bleSerialSet.has(board.serialNumber);
          return (
            <div
              key={board.uuid}
              className={`${styles.myBoardCardFadeIn} ${myBoardsVisible ? styles.myBoardCardFadeInVisible : ''}`}
            >
              <BoardScrollCard
                userBoard={board}
                selected={selectedBoardUuid === board.uuid}
                onClick={() => (isBleNearby ? handleBleBoardClick(board) : onBoardClick(board))}
                bluetoothNearby={isBleNearby}
              />
            </div>
          );
        })}

        {popularConfigs.map((config) => (
          <BoardScrollCard
            key={`${config.boardType}-${config.layoutId}-${config.sizeId}`}
            popularConfig={config}
            onClick={() => onConfigClick(config)}
          />
        ))}
      </BoardScrollSection>

      <BoardSearchDrawer
        open={searchDrawerOpen}
        onClose={handleSearchDrawerClose}
        onBoardOpen={handleSearchDrawerBoardClick}
      />
    </>
  );
}
