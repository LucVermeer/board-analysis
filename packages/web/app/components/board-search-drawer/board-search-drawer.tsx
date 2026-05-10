'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import Button from '@mui/material/Button';
import SearchOutlined from '@mui/icons-material/SearchOutlined';
import CloseOutlined from '@mui/icons-material/CloseOutlined';
import OpenInNewOutlined from '@mui/icons-material/OpenInNewOutlined';
import SwipeableDrawer from '@/app/components/swipeable-drawer/swipeable-drawer';
import BoardCard from '@/app/components/board-entity/board-card';
import FollowButton from '@/app/components/ui/follow-button';
import { useGeolocation } from '@/app/hooks/use-geolocation';
import { useSearchBoardsMap } from '@/app/hooks/use-search-boards-map';
import { FOLLOW_BOARD, UNFOLLOW_BOARD } from '@/app/lib/graphql/operations';
import { themeTokens } from '@/app/theme/theme-config';
import type { UserBoard } from '@boardsesh/shared-schema';
import BoardSearchMap from './board-search-map';

const DEFAULT_CENTER = { lat: 20, lng: 0 }; // World view — neutral starting point until geolocation resolves
const DEFAULT_ZOOM = 3;
const NEARBY_ZOOM = 11; // ~20 km radius via the zoomToRadiusKm table
const CAROUSEL_CARD_WIDTH = 280; // Empirically picked to fit the BoardCard layout without truncation
const CAROUSEL_LOAD_INDICATOR_WIDTH = 80;
const INFINITE_SCROLL_THRESHOLD = 300; // Trigger fetchNextPage when within this many px of the right edge

type BoardSearchDrawerProps = {
  open: boolean;
  onClose: () => void;
  onBoardOpen: (board: UserBoard) => void;
};

export default function BoardSearchDrawer({ open, onClose, onBoardOpen }: BoardSearchDrawerProps) {
  const { t } = useTranslation('boards');
  const { coordinates: userCoords, requestPermission } = useGeolocation();

  const [query, setQuery] = useState('');
  const [center, setCenter] = useState(DEFAULT_CENTER);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [selectedBoardUuid, setSelectedBoardUuid] = useState<string | null>(null);
  const [requestedGeo, setRequestedGeo] = useState(false);
  // True once the map has been panned by the user or geolocation has resolved.
  // Kept separate from `center` to avoid the footgun where center === DEFAULT_CENTER
  // would silently suppress coordinate-based queries for users at exactly (20, 0).
  const [locationResolved, setLocationResolved] = useState(false);

  const carouselRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  // Mirrors locationResolved state so the geolocation effect can guard against
  // re-running without adding locationResolved to its dep array (which would
  // cause a second no-op run every time the effect sets it to true).
  const locationResolvedRef = useRef(false);
  // Defer mounting BoardSearchMap (and its OpenStreetMap tile downloads) until
  // the drawer has been opened at least once. Sticky — once true it stays true
  // across close/reopen so the map state and tile cache persist between sessions.
  // Track the sticky flag in state, but derive `mapMounted` so the FIRST render
  // after `open` flips to true already includes the map. Otherwise the user
  // would see an empty Box for one frame while a useEffect-based update lands.
  const [hasOpenedOnce, setHasOpenedOnce] = useState(false);
  if (open && !hasOpenedOnce) {
    // Conditional setState during render is the React idiom for "derive sticky
    // state from a prop" — React schedules a follow-up render with the new value
    // rather than warning. Mount stays alive across future open=false.
    setHasOpenedOnce(true);
  }
  const mapMounted = hasOpenedOnce || open;

  // Ask for the user's location on first open. If granted we'll recenter to ~20km view.
  useEffect(() => {
    if (!open || requestedGeo) return;
    setRequestedGeo(true);
    void requestPermission();
  }, [open, requestedGeo, requestPermission]);

  useEffect(() => {
    // !open guard: the close-effect sets locationResolved=false which re-triggers
    // this effect while the drawer is still closed. Bail out then; the dep change
    // on open=true when the drawer reopens will run the effect at the right time.
    // locationResolvedRef (not state) is used here so adding it to deps doesn't
    // cause a second no-op run after this effect sets locationResolved=true.
    if (!userCoords || !open || locationResolvedRef.current) return;
    setCenter({ lat: userCoords.latitude, lng: userCoords.longitude });
    setZoom((prev) => (prev === DEFAULT_ZOOM ? NEARBY_ZOOM : prev));
    locationResolvedRef.current = true;
    setLocationResolved(true);
  }, [userCoords, open]);

  // Reset transient drawer state each time the drawer is closed. Clearing
  // requestedGeo lets us retry the permission prompt if the user denied it
  // last time (e.g. after they grant it in site settings). Resetting the
  // viewport ensures the next open either auto-centers on the user's
  // location (if granted) or shows the world fallback — not a half-panned
  // state left over from the previous session.
  useEffect(() => {
    if (!open) {
      setSelectedBoardUuid(null);
      setQuery('');
      setRequestedGeo(false);
      setCenter(DEFAULT_CENTER);
      setZoom(DEFAULT_ZOOM);
      locationResolvedRef.current = false;
      setLocationResolved(false);
    }
  }, [open]);

  const { boards, isLoading, isFetching, radiusKm, hasMore, isFetchingNextPage, fetchNextPage } = useSearchBoardsMap({
    query,
    // While the map is still at the default world-view fallback (locationResolved=false),
    // don't fire a coordinate-based search — the 300 km bucket at zoom 3 would surface a
    // cluster of boards in Kansas to every user until geolocation resolves.
    latitude: locationResolved ? center.lat : null,
    longitude: locationResolved ? center.lng : null,
    zoom,
    enabled: open,
  });

  // Infinite scroll inside the horizontal carousel: load the next page when the
  // user scrolls within 300px of the right edge. We can't reuse the shared
  // `useInfiniteScroll` hook here because it observes against the viewport,
  // whereas the sentinel lives inside an overflow:auto horizontal container.
  const handleCarouselScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      if (!hasMore || isFetchingNextPage) return;
      const el = e.currentTarget;
      const remaining = el.scrollWidth - (el.scrollLeft + el.clientWidth);
      if (remaining < INFINITE_SCROLL_THRESHOLD) fetchNextPage();
    },
    [hasMore, isFetchingNextPage, fetchNextPage],
  );

  const handleViewportChange = useCallback(({ lat, lng, zoom: z }: { lat: number; lng: number; zoom: number }) => {
    setCenter({ lat, lng });
    setZoom(z);
    locationResolvedRef.current = true;
    setLocationResolved(true);
  }, []);

  const scrollCardIntoView = useCallback((uuid: string) => {
    const node = cardRefs.current.get(uuid);
    if (!node) return;
    node.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, []);

  const handleMarkerClick = useCallback(
    (board: UserBoard) => {
      setSelectedBoardUuid(board.uuid);
      // Defer scroll so the new layout (if expanded) settles first
      requestAnimationFrame(() => scrollCardIntoView(board.uuid));
    },
    [scrollCardIntoView],
  );

  const handleCardClick = useCallback((board: UserBoard) => {
    setSelectedBoardUuid(board.uuid);
    if (board.latitude != null && board.longitude != null) {
      setCenter({ lat: board.latitude, lng: board.longitude });
      locationResolvedRef.current = true;
      setLocationResolved(true);
      // Keep zoom — user's spatial context shouldn't jump
    }
  }, []);

  const setCardRef = useCallback(
    (uuid: string) => (node: HTMLDivElement | null) => {
      if (node) cardRefs.current.set(uuid, node);
      else cardRefs.current.delete(uuid);
    },
    [],
  );

  const showSpinner = isLoading || (isFetching && boards.length === 0);

  return (
    <SwipeableDrawer
      placement="bottom"
      open={open}
      onClose={onClose}
      title={t('boardSearchDrawer.title')}
      fullHeight
      height="100dvh"
      showCloseButton
      showCloseButtonOnMobile
      styles={{ body: { padding: 0 } }}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Search bar */}
        <Box sx={{ px: 2, pt: 1.5, pb: 1, borderBottom: '1px solid var(--neutral-200)' }}>
          <TextField
            fullWidth
            size="small"
            placeholder={t('boardSearchDrawer.searchPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchOutlined fontSize="small" color="action" />
                  </InputAdornment>
                ),
                endAdornment: query ? (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setQuery('')} aria-label={t('boardSearchDrawer.clear')}>
                      <CloseOutlined fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ) : undefined,
              },
            }}
          />
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              mt: 0.75,
            }}
          >
            <Typography variant="caption" color="text.secondary">
              {t('boardSearchDrawer.radiusInfo', { radiusKm })}
            </Typography>
            {isFetching && boards.length > 0 && <CircularProgress size={14} />}
          </Box>
        </Box>

        {/* Map */}
        <Box sx={{ flex: 1, minHeight: 0, position: 'relative' }}>
          {mapMounted && (
            <BoardSearchMap
              center={center}
              zoom={zoom}
              boards={boards}
              selectedBoardUuid={selectedBoardUuid}
              userCoords={userCoords}
              requestPermission={requestPermission}
              onBoardClick={handleMarkerClick}
              onViewportChange={handleViewportChange}
            />
          )}
        </Box>

        {/* Results carousel */}
        <Box
          sx={{
            borderTop: '1px solid var(--neutral-200)',
            backgroundColor: 'var(--semantic-background)',
            flexShrink: 0,
          }}
        >
          {showSpinner && (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 3 }}>
              <CircularProgress size={20} />
            </Box>
          )}
          {!showSpinner && boards.length === 0 && (
            <Box sx={{ py: 3, textAlign: 'center', px: 2 }}>
              <Typography variant="body2" color="text.secondary">
                {query.trim().length >= 2
                  ? t('boardSearchDrawer.emptyWithQuery', { query: query.trim() })
                  : t('boardSearchDrawer.empty')}
              </Typography>
            </Box>
          )}
          {!showSpinner && boards.length > 0 && (
            <Box
              ref={carouselRef}
              onScroll={handleCarouselScroll}
              sx={{
                display: 'flex',
                gap: 1.5,
                overflowX: 'auto',
                px: 2,
                py: 1.5,
                scrollSnapType: 'x proximity',
                scrollbarWidth: 'none',
                '&::-webkit-scrollbar': { display: 'none' },
              }}
            >
              {boards.map((board) => {
                const isSelected = board.uuid === selectedBoardUuid;
                return (
                  <Box
                    key={board.uuid}
                    ref={setCardRef(board.uuid)}
                    sx={{
                      width: CAROUSEL_CARD_WIDTH,
                      flexShrink: 0,
                      scrollSnapAlign: 'start',
                      outline: isSelected ? `2px solid var(--color-primary)` : 'none',
                      borderRadius: `${themeTokens.borderRadius.lg}px`,
                      transition: themeTokens.transitions.fast,
                    }}
                  >
                    <BoardCard
                      board={board}
                      onClick={handleCardClick}
                      trailingAction={
                        isSelected ? (
                          <Stack direction="row" spacing={1} alignItems="center">
                            <FollowButton
                              entityId={board.uuid}
                              initialIsFollowing={board.isFollowedByMe}
                              followMutation={FOLLOW_BOARD}
                              unfollowMutation={UNFOLLOW_BOARD}
                              entityLabel="board"
                              getFollowVariables={(id) => ({ input: { boardUuid: id } })}
                            />
                            <Button
                              variant="contained"
                              size="small"
                              startIcon={<OpenInNewOutlined />}
                              onClick={(e) => {
                                e.stopPropagation();
                                onBoardOpen(board);
                              }}
                              sx={{ textTransform: 'none' }}
                            >
                              {t('boardSearchDrawer.open')}
                            </Button>
                          </Stack>
                        ) : undefined
                      }
                    />
                  </Box>
                );
              })}
              {isFetchingNextPage && (
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: CAROUSEL_LOAD_INDICATOR_WIDTH,
                    flexShrink: 0,
                  }}
                >
                  <CircularProgress size={20} />
                </Box>
              )}
            </Box>
          )}
        </Box>
      </Box>
    </SwipeableDrawer>
  );
}
