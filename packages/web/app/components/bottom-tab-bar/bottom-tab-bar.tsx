'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import BottomNavigation from '@mui/material/BottomNavigation';
import BottomNavigationAction from '@mui/material/BottomNavigationAction';
import SwipeableDrawer from '../swipeable-drawer/swipeable-drawer';
import HomeOutlined from '@mui/icons-material/HomeOutlined';
import FormatListBulletedOutlined from '@mui/icons-material/FormatListBulletedOutlined';
import AddOutlined from '@mui/icons-material/AddOutlined';
import LocalOfferOutlined from '@mui/icons-material/LocalOfferOutlined';
import PersonOutlined from '@mui/icons-material/PersonOutlined';
import { useLocaleRouter, usePathnameWithoutLocale } from '@/app/lib/i18n/use-locale-router';
import { track } from '@vercel/analytics';
import type { BoardDetails, BoardName, BoardRouteIdentity } from '@/app/lib/types';
import {
  constructClimbListWithSlugs,
  constructBoardSlugListUrl,
  tryConstructSlugListUrl,
  generateLayoutSlug,
  generateSizeSlug,
  generateSetSlug,
  searchParamsToUrlParams,
  getPlaylistsBasePath,
} from '@/app/lib/url-utils';
import { themeTokens, darkTokens } from '@/app/theme/theme-config';
import { useColorMode } from '@/app/hooks/use-color-mode';
import { useAuthModal } from '@/app/components/providers/auth-modal-provider';
import { usePersistentSessionState } from '../persistent-session';
import { getLastUsedBoard } from '@/app/lib/last-used-board-db';
import { getRecentSearches } from '@/app/components/search-drawer/recent-searches-storage';
import BoardDiscoveryScroll from '../board-scroll/board-discovery-scroll';
import BoardSelectorDrawer from '../board-selector-drawer/board-selector-drawer';
import type { BoardConfigData } from '@/app/lib/server-board-configs';
import { getDefaultAngleForBoard } from '@/app/lib/board-config-for-playlist';
import { useSession } from 'next-auth/react';
import type { UserBoard, PopularBoardConfig } from '@boardsesh/shared-schema';
import type { StoredBoardConfig } from '@/app/lib/saved-boards-db';
import { useBoardSwitchGuard } from '@/app/components/board-lock/use-board-switch-guard';

type Tab = 'home' | 'climbs' | 'library' | 'create' | 'you';

type BottomTabBarProps = {
  boardDetails?: BoardDetails | null;
  angle?: number;
  boardConfigs?: BoardConfigData;
};

const getActiveTab = (pathname: string): Tab => {
  if (pathname === '/') return 'home';
  if (pathname.endsWith('/create')) return 'create';
  // /you/feed (and any other /you/* sub-route) lights up the You tab.
  if (pathname.startsWith('/you')) return 'you';
  if (pathname.startsWith('/discover/')) return 'library';
  if (pathname.startsWith('/playlists') || pathname.includes('/playlists')) return 'library';
  return 'climbs';
};

// Scroll-direction hook. Returns true while the user is scrolling *down* past
// COLLAPSE_THRESHOLD; flips back to false on any upward scroll or when they're
// near the top of the page (< NEAR_TOP_PX). Movement under MIN_DELTA is ignored
// to keep the pill stable on tiny scroll jitter (iOS rubber-banding, etc.).
const COLLAPSE_THRESHOLD = 8;
const NEAR_TOP_PX = 24;
function useScrollCollapsed(): boolean {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let lastY = window.scrollY;
    let frame = 0;
    const handle = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const y = window.scrollY;
        const delta = y - lastY;
        if (y < NEAR_TOP_PX) {
          setCollapsed(false);
        } else if (delta > COLLAPSE_THRESHOLD) {
          setCollapsed(true);
        } else if (delta < -COLLAPSE_THRESHOLD) {
          setCollapsed(false);
        }
        lastY = y;
      });
    };
    window.addEventListener('scroll', handle, { passive: true });
    return () => {
      window.removeEventListener('scroll', handle);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);
  return collapsed;
}

const listUrlToCreateUrl = (url: string): string => {
  const [path, query = ''] = url.split('?');
  if (!path.endsWith('/list')) return url;
  const createPath = `${path.slice(0, -5)}/create`;
  return query ? `${createPath}?${query}` : createPath;
};

const actionSx = {
  color: 'var(--neutral-400)',
  '&.Mui-selected': { color: themeTokens.colors.primary },
  WebkitTapHighlightColor: 'transparent',
  touchAction: 'manipulation',
  minWidth: 'auto',
};

function BottomTabBar({ boardDetails, angle, boardConfigs }: BottomTabBarProps) {
  const { t } = useTranslation('playlists');
  const { mode } = useColorMode();
  const isDark = mode === 'dark';
  const collapsed = useScrollCollapsed();
  const { openAuthModal } = useAuthModal();

  // Publish the collapsed state as a `data-` attribute on <html> so other
  // floating UI (specifically the queue-control FAB cluster, portal-rendered
  // outside this component's tree) can subscribe via plain CSS — no shared
  // state, no measurement-based jitter. Binary toggle = single 200ms
  // transition on the consumer side that matches the bar's own animation.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.dataset.tabBarCollapsed = collapsed ? 'true' : 'false';
    return () => {
      delete document.documentElement.dataset.tabBarCollapsed;
    };
  }, [collapsed]);
  const [isBoardSelectorOpen, setIsBoardSelectorOpen] = useState(false);
  const [isBoardSelectorRendered, setIsBoardSelectorRendered] = useState(false);
  const [isCustomBoardOpen, setIsCustomBoardOpen] = useState(false);
  const [isCustomBoardRendered, setIsCustomBoardRendered] = useState(false);
  const [isCreateClimbFlow, setIsCreateClimbFlow] = useState(false);

  // Stable callbacks for drawer unmount-after-close-animation pattern.
  // Avoids invalidating MUI's SlideProps memo on every parent render.
  const handleCustomBoardTransitionEnd = useCallback((open: boolean) => {
    if (!open) setIsCustomBoardRendered(false);
  }, []);
  const handleBoardSelectorTransitionEnd = useCallback((open: boolean) => {
    if (!open) setIsBoardSelectorRendered(false);
  }, []);

  const pathname = usePathnameWithoutLocale();
  const router = useLocaleRouter();
  const guardBoardSwitch = useBoardSwitchGuard();

  const { data: session, status: sessionStatus } = useSession();
  const isAuthenticated = sessionStatus === 'authenticated';

  // Use the active queue's board details as a fallback when no boardDetails prop
  const { activeSession, localBoardDetails, localCurrentClimbQueueItem } = usePersistentSessionState();

  // Resolve effective board details: prop > active session > local queue
  const effectiveBoardDetails =
    boardDetails ?? (activeSession ? activeSession.boardDetails : null) ?? localBoardDetails;
  const effectiveAngle =
    angle ??
    (activeSession ? activeSession.parsedParams.angle : undefined) ??
    localCurrentClimbQueueItem?.climb?.angle ??
    0;

  // Determine active tab from pathname
  const activeTab = getActiveTab(pathname);

  // Build URLs using effective board details
  // If we're on a /b/ slug route, preserve the slug URL format
  const listUrl = (() => {
    if (pathname.startsWith('/b/')) {
      const segments = pathname.split('/');
      // /b/{slug}/{angle}/... → /b/{slug}/{angle}/list
      if (segments.length >= 4) {
        return `/b/${segments[2]}/${segments[3]}/list`;
      }
    }
    // Fallback: use active session's board path if it's a /b/ slug route
    if (activeSession?.boardPath?.startsWith('/b/')) {
      const segments = activeSession.boardPath.split('/');
      if (segments.length >= 4) {
        return `/b/${segments[2]}/${segments[3]}/list`;
      }
    }
    if (!effectiveBoardDetails) return null;
    const { board_name, layout_name, size_name, size_description, set_names } = effectiveBoardDetails;
    if (layout_name && size_name && set_names) {
      return constructClimbListWithSlugs(
        board_name,
        layout_name,
        size_name,
        size_description,
        set_names,
        effectiveAngle,
      );
    }
    return null;
  })();

  const createClimbUrl = (() => {
    if (!effectiveBoardDetails) return null;
    const { board_name, layout_name, size_name, size_description, set_names } = effectiveBoardDetails;
    if (layout_name && size_name && set_names) {
      return `/${board_name}/${generateLayoutSlug(layout_name)}/${generateSizeSlug(size_name, size_description)}/${generateSetSlug(set_names)}/${effectiveAngle}/create`;
    }
    return null;
  })();

  const handleHomeTab = () => {
    router.push('/');
    track('Bottom Tab Bar', { tab: 'home' });
  };

  // Whether we're currently on a board page (URL derived from pathname is reliable)
  const isOnBoardPage =
    pathname.startsWith('/b/') ||
    (!!effectiveBoardDetails &&
      pathname !== '/' &&
      !pathname.startsWith('/profile') &&
      !pathname.startsWith('/you') &&
      !pathname.startsWith('/playlists') &&
      !pathname.startsWith('/notifications'));

  const handleClimbsTab = async () => {
    let url: string | null = null;

    if (isOnBoardPage) {
      // On a board page, use listUrl derived from the current pathname
      url = listUrl;
    } else {
      // Not on a board page: prefer the stored URL (preserves /b/ format)
      const lastUsed = await getLastUsedBoard();
      if (lastUsed?.url) {
        url = lastUsed.url;
      }
      // Fall back to computed listUrl from session board details
      if (!url) {
        url = listUrl;
      }
    }

    // Final fallback for isOnBoardPage case where listUrl is null
    if (!url) {
      const lastUsed = await getLastUsedBoard();
      url = lastUsed?.url ?? null;
    }

    // Open board selector drawer if no board context
    if (!url) {
      setIsBoardSelectorRendered(true);
      setIsBoardSelectorOpen(true);
      track('Bottom Tab Bar', { tab: 'climbs', action: 'open_selector' });
      return;
    }

    // Auto-apply most recent filter
    try {
      const recentSearches = await getRecentSearches();
      if (recentSearches.length > 0) {
        const mostRecent = recentSearches[0];
        const filterParams = searchParamsToUrlParams(
          mostRecent.filters as Parameters<typeof searchParamsToUrlParams>[0],
        );
        const filterString = filterParams.toString();
        if (filterString) {
          url = `${url}?${filterString}`;
        }
      }
    } catch {
      // Ignore errors loading recent searches
    }

    // Preserve active session param so BoardSessionBridge can re-activate the session
    if (activeSession?.sessionId && url) {
      const separator = url.includes('?') ? '&' : '?';
      url = `${url}${separator}session=${activeSession.sessionId}`;
    }

    const currentUrl = pathname + (typeof window !== 'undefined' ? window.location.search : '');
    if (url !== currentUrl) {
      router.push(url);
    }
    track('Bottom Tab Bar', { tab: 'climbs' });
  };

  const playlistsUrl = getPlaylistsBasePath(pathname);

  const handleLibraryTab = () => {
    const currentUrl = pathname + (typeof window !== 'undefined' ? window.location.search : '');
    if (playlistsUrl !== currentUrl) {
      router.push(playlistsUrl);
    }
    track('Bottom Tab Bar', { tab: 'library' });
  };

  const handleYouTab = () => {
    if (!isAuthenticated || !session?.user?.id) {
      openAuthModal({
        title: t('bottomTabBar.youSignInTitle'),
        description: t('bottomTabBar.youSignInDescription'),
        onSuccess: () => {
          router.push('/you');
        },
      });
      return;
    }
    router.push('/you');
    track('Bottom Tab Bar', { tab: 'you' });
  };

  const handleCreateTab = () => {
    track('Bottom Tab Bar', { tab: 'create' });
    // Go directly to create climb, skip the drawer
    if (createClimbUrl) {
      router.push(createClimbUrl);
      return;
    }
    if (boardConfigs) {
      setIsCreateClimbFlow(true);
      setIsBoardSelectorRendered(true);
      setIsBoardSelectorOpen(true);
    }
  };

  const handleTabChange = (_event: React.SyntheticEvent, newValue: Tab) => {
    switch (newValue) {
      case 'home':
        handleHomeTab();
        break;
      case 'climbs':
        void handleClimbsTab();
        break;
      case 'library':
        handleLibraryTab();
        break;
      case 'create':
        handleCreateTab();
        break;
      case 'you':
        handleYouTab();
        break;
    }
  };

  const handleBoardSelected = useCallback(
    (url: string, config?: StoredBoardConfig) => {
      if (isCreateClimbFlow) {
        router.push(listUrlToCreateUrl(url));
        setIsCreateClimbFlow(false);
        return;
      }

      if (config) {
        const target: BoardRouteIdentity = {
          board_name: config.board,
          layout_id: config.layoutId,
          size_id: config.sizeId,
          set_ids: config.setIds,
        };
        guardBoardSwitch(target, () => router.push(url));
      } else {
        router.push(url);
      }
    },
    [isCreateClimbFlow, router, guardBoardSwitch],
  );

  const handleDiscoveryBoardClick = useCallback(
    (board: UserBoard) => {
      if (board.slug) {
        const url = constructBoardSlugListUrl(board.slug, board.angle);
        const config: StoredBoardConfig = {
          name: board.name,
          board: board.boardType as BoardName,
          layoutId: board.layoutId,
          sizeId: board.sizeId,
          setIds: board.setIds.split(',').map(Number),
          angle: board.angle,
          createdAt: board.createdAt,
        };
        handleBoardSelected(url, config);
      }
      setIsBoardSelectorOpen(false);
    },
    [handleBoardSelected],
  );

  const handleDiscoveryConfigClick = useCallback(
    (config: PopularBoardConfig) => {
      const angle = getDefaultAngleForBoard(config.boardType);
      let url: string;
      if (config.layoutName && config.sizeName && config.setNames.length > 0) {
        url = constructClimbListWithSlugs(
          config.boardType,
          config.layoutName,
          config.sizeName,
          config.sizeDescription ?? undefined,
          config.setNames,
          angle,
        );
      } else {
        const setIds = config.setIds.join(',');
        url =
          tryConstructSlugListUrl(config.boardType, config.layoutId, config.sizeId, config.setIds, angle) ??
          `/${config.boardType}/${config.layoutId}/${config.sizeId}/${setIds}/${angle}/list`;
      }
      const storedConfig: StoredBoardConfig = {
        name: config.layoutName ?? `${config.boardType} board`,
        board: config.boardType as BoardName,
        layoutId: config.layoutId,
        sizeId: config.sizeId,
        setIds: config.setIds,
        angle,
        createdAt: new Date().toISOString(),
      };
      handleBoardSelected(url, storedConfig);
      setIsBoardSelectorOpen(false);
    },
    [handleBoardSelected],
  );

  const glassSurface = isDark ? darkTokens.glass.surface : themeTokens.glass.surface;
  const glassBorder = isDark ? darkTokens.glass.border : themeTokens.glass.border;
  const glassHighlight = isDark ? darkTokens.glass.highlight : themeTokens.glass.highlight;
  const glassBlur = isDark ? themeTokens.glass.blur.strong : themeTokens.glass.blur.soft;
  const glassShadow = isDark ? darkTokens.shadows.lg : themeTokens.shadows.lg;

  return (
    <>
      <BottomNavigation
        data-testid="bottom-tab-bar"
        data-collapsed={collapsed ? 'true' : 'false'}
        value={activeTab}
        onChange={handleTabChange}
        showLabels={!collapsed}
        sx={{
          // Liquid-glass pill: layered translucent fill + top-edge highlight + hairline border.
          background: `${glassHighlight}, ${glassSurface}`,
          WebkitBackdropFilter: `blur(${glassBlur}) saturate(180%)`,
          backdropFilter: `blur(${glassBlur}) saturate(180%)`,
          border: `1px solid ${glassBorder}`,
          boxShadow: glassShadow,
          borderRadius: `${themeTokens.borderRadius.full}px`,
          // Smoothly animate every collapse property at once.
          transition: `min-height ${themeTokens.transitions.normal}, padding ${themeTokens.transitions.normal}, max-width ${themeTokens.transitions.normal}, opacity ${themeTokens.transitions.normal}, transform ${themeTokens.transitions.normal}`,
          pt: `${collapsed ? 0 : themeTokens.spacing[2]}px`,
          pb: `calc(${collapsed ? 0 : themeTokens.spacing[2]}px + var(--tab-bar-safe-area-padding, 0px))`,
          px: `${collapsed ? themeTokens.spacing[1] : themeTokens.spacing[2]}px`,
          mb: 'var(--tab-bar-bottom-extension, 0px)',
          minHeight: collapsed ? 28 : 64,
          height: 'auto',
          mx: 'auto',
          maxWidth: collapsed ? 220 : 'min(560px, 100%)',
          // When collapsed, the whole pill recedes — smaller, lower-contrast,
          // mirrors the Safari chrome shrink so the user knows it's still
          // there but is out of the way.
          opacity: collapsed ? themeTokens.opacity.subtle : 1,
          '& .MuiBottomNavigationAction-root': {
            minWidth: collapsed ? 32 : 'auto',
            maxWidth: collapsed ? 32 : undefined,
            padding: collapsed ? '0 2px' : undefined,
            minHeight: collapsed ? 24 : undefined,
            transition: `min-width ${themeTokens.transitions.normal}, padding ${themeTokens.transitions.normal}`,
          },
          '& .MuiBottomNavigationAction-label': {
            transition: `opacity ${themeTokens.transitions.normal}`,
            opacity: collapsed ? 0 : 1,
            display: collapsed ? 'none' : undefined,
          },
          '& .MuiSvgIcon-root': {
            transition: `font-size ${themeTokens.transitions.normal}`,
            fontSize: collapsed ? 14 : 20,
          },
        }}
      >
        <BottomNavigationAction label={t('bottomTabBar.home')} icon={<HomeOutlined />} value="home" sx={actionSx} />
        <BottomNavigationAction
          label={t('bottomTabBar.climb')}
          icon={<FormatListBulletedOutlined />}
          value="climbs"
          sx={actionSx}
        />
        <BottomNavigationAction
          label={t('bottomTabBar.discover')}
          icon={<LocalOfferOutlined />}
          value="library"
          sx={actionSx}
        />
        <BottomNavigationAction label={t('bottomTabBar.create')} icon={<AddOutlined />} value="create" sx={actionSx} />
        <BottomNavigationAction label={t('bottomTabBar.you')} icon={<PersonOutlined />} value="you" sx={actionSx} />
      </BottomNavigation>

      {/* Board Selector Drawer */}
      {isBoardSelectorRendered && (
        <SwipeableDrawer
          title={t('common:boardSelector.title')}
          placement="bottom"
          open={isBoardSelectorOpen}
          onClose={() => {
            setIsBoardSelectorOpen(false);
            setIsCreateClimbFlow(false);
          }}
          onTransitionEnd={handleBoardSelectorTransitionEnd}
        >
          <BoardDiscoveryScroll
            onBoardClick={handleDiscoveryBoardClick}
            onConfigClick={handleDiscoveryConfigClick}
            onCustomClick={() => {
              setIsBoardSelectorOpen(false);
              setIsCustomBoardRendered(true);
              setIsCustomBoardOpen(true);
            }}
          />
        </SwipeableDrawer>
      )}

      {/* Custom Board Selector Drawer */}
      {boardConfigs && isCustomBoardRendered && (
        <BoardSelectorDrawer
          open={isCustomBoardOpen}
          onClose={() => setIsCustomBoardOpen(false)}
          onTransitionEnd={handleCustomBoardTransitionEnd}
          boardConfigs={boardConfigs}
          placement="bottom"
          onBoardSelected={(url) => {
            handleBoardSelected(url);
            setIsCustomBoardOpen(false);
          }}
        />
      )}
    </>
  );
}

export default BottomTabBar;
