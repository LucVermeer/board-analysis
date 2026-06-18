// Single source of truth for the climb long-press action list. Both the bottom
// sheet (`ClimbActionsSheet`, used on Android / inside the board sheet / as the
// Reduce-Transparency fallback) and the native iOS context menu (`ClimbContextMenu`)
// render the SAME ordered, gated list from this hook, so the two presentations can
// never drift. Each item carries the display metadata (label, icon, colour) plus a
// `run()` that performs the action and then calls `onAfterAction` (the sheet passes
// its `onClose`; the native menu, which dismisses itself, passes nothing).
//
// The hook self-sources every opener (queue / playlist / tick / beta video / play
// drawer) from `useDrawerHost`, the favourite mutation from `useToggleFavorite`, and
// the create-climb routes from the router, so a caller only supplies the climb, its
// board config, and the two contextual flags (`currentUserId`, `isAuthenticated`)
// plus the logbook-only `onEditEntry`.

import { useCallback, useMemo } from 'react';
import type { OpaqueColorValue } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import * as Clipboard from 'expo-clipboard';
import * as WebBrowser from 'expo-web-browser';
import type { Climb } from '@boardsesh/shared-schema';
import { buildClimbViewPath } from '@boardsesh/play-view';
import { computeCanUpdate, type SavedClimbSnapshot } from '@boardsesh/create-climb-react';
import { SHARED_EVENTS } from '@boardsesh/analytics';
import { favoritesStore } from '@boardsesh/climb-actions';
import type { IconName } from '../icon-map';
import { useDrawerHost, boardConfigsMatch, type BoardConfig } from '../../providers/drawer-host-provider';
import { useQueueActions } from '../../providers/queue-provider';
import { useToast } from '../../providers/toast-provider';
import { useToggleFavorite } from '../../lib/graphql/hooks';
import { climbToQueueItem } from '../../lib/climb-to-queue-item';
import { useTheme } from '../../providers/theme-provider';
import { WEB_BASE_URL } from '../../lib/env';
import { track } from '../../lib/analytics';

export type ClimbActionId =
  | 'preview'
  | 'queue'
  | 'playlist'
  | 'favorite'
  | 'tick'
  | 'editEntry'
  | 'betaVideo'
  | 'edit'
  | 'fork'
  | 'copyLink'
  | 'openInApp';

export type ClimbActionItem = {
  id: ClimbActionId;
  /** Already-translated label. */
  title: string;
  /** App icon name — also the source of the iOS SF Symbol via `iconMap[icon].ios`. */
  icon: IconName;
  /** Resolved foreground colour (monochrome on Liquid Glass, semantic on Material).
   *  `string | OpaqueColorValue` because iOS system colours are PlatformColor. */
  color: string | OpaqueColorValue;
  /** Performs the action, then calls `onAfterAction`. */
  run: () => void;
};

type UseClimbActionsArgs = {
  climb: Climb | null;
  boardConfig: BoardConfig | null;
  /** Signed-in user id — gates the owner-only Edit action. */
  currentUserId?: string | null;
  /** Gates the "Add beta video" action. */
  isAuthenticated: boolean;
  /** When provided, adds an "Edit entry" action wired to the tick editor (logbook only). */
  onEditEntry?: () => void;
  /** Run after any action fires. The sheet passes its `onClose`; the native menu omits it. */
  onAfterAction?: () => void;
};

// Mirrors web's constructClimbInfoUrl: Kilter no longer has a public app URL.
function buildAuroraAppUrl(boardName: string, climbUuid: string): string | null {
  if (boardName === 'kilter') return null;
  const suffix = boardName === 'tension' ? '2' : '';
  return `https://${boardName}boardapp${suffix}.com/climbs/${climbUuid}`;
}

export function useClimbActions({
  climb,
  boardConfig,
  currentUserId,
  isAuthenticated,
  onEditEntry,
  onAfterAction,
}: UseClimbActionsArgs): ClimbActionItem[] {
  const { t } = useTranslation('climbs');
  const router = useRouter();
  const { showToast } = useToast();
  const { actionColors } = useTheme();
  const { addToQueue } = useQueueActions();
  const { mutate: toggleFavoriteMutate } = useToggleFavorite();
  const {
    openPlayDrawer,
    openAddToPlaylist,
    openLogAscent,
    openAddBetaVideo,
    boardConfig: activeBoardConfig,
  } = useDrawerHost();

  const after = useCallback(() => onAfterAction?.(), [onAfterAction]);

  return useMemo<ClimbActionItem[]>(() => {
    if (!climb || !boardConfig) return [];

    const { boardName, layoutId, sizeId, setIds, angle } = boardConfig;
    const { success: successColor, favorite: favoriteColor, accent: accentColor } = actionColors;
    const auroraAppUrl = buildAuroraAppUrl(boardName, climb.uuid);

    // Edit is owner-only, and only while the climb is still a draft OR within 24h of
    // first publish (the backend enforces the same window). `userId` is null for
    // Aurora-synced climbs that predate Boardsesh accounts.
    const canEdit = (() => {
      if (!currentUserId || !climb.userId || climb.userId !== currentUserId) return false;
      const snapshot: SavedClimbSnapshot = {
        uuid: climb.uuid,
        boardType: boardName,
        createdAt: climb.created_at ?? null,
        publishedAt: climb.published_at ?? null,
        isDraft: climb.is_draft ?? false,
      };
      return computeCanUpdate(snapshot, boardName);
    })();

    const items: ClimbActionItem[] = [];

    // View-only open: a previewQueueItem (badge + "Set active") rather than committing.
    // Mirror the board-sheet override rule so a cross-board climb still renders the
    // switch-board overlay; same-board needs no override.
    items.push({
      id: 'preview',
      title: t('mobile.climbActions.preview'),
      icon: 'visibility',
      color: accentColor,
      run: () => {
        const override = boardConfigsMatch(boardConfig, activeBoardConfig) ? undefined : boardConfig;
        openPlayDrawer(climb, {
          previewQueueItem: climbToQueueItem(climb),
          boardConfig: override,
          source: 'climb_view',
        });
        after();
      },
    });

    items.push({
      id: 'queue',
      title: t('mobile.climbRow.addToQueue'),
      icon: 'add',
      color: successColor,
      run: () => {
        addToQueue({ uuid: randomUUID(), climb });
        after();
      },
    });

    items.push({
      id: 'playlist',
      title: t('actions.playlist.popover.title'),
      icon: 'playlist',
      color: accentColor,
      run: () => {
        openAddToPlaylist(climb, boardConfig);
        after();
      },
    });

    items.push({
      id: 'favorite',
      title: t('mobile.climbRow.toggleFavorite'),
      icon: 'favorite',
      color: favoriteColor,
      run: () => {
        const isNowFavorited = !favoritesStore.getIsFavorited(climb.uuid);
        track(SHARED_EVENTS.FavoriteToggle, {
          action: isNowFavorited ? 'added' : 'removed',
          climbUuid: climb.uuid,
          boardName,
          layoutId,
          source: 'mobile_climb_actions',
        });
        toggleFavoriteMutate({ input: { boardName, climbUuid: climb.uuid, angle } });
        after();
      },
    });

    items.push({
      id: 'tick',
      title: t('mobile.climbActions.tick'),
      icon: 'tick',
      color: successColor,
      run: () => {
        openLogAscent({
          climbUuid: climb.uuid,
          boardName,
          angle,
          isMirror: false,
          isBenchmark: !!climb.benchmark_difficulty,
          layoutId,
          sizeId,
          setIds,
          consensusGradeName: climb.difficulty,
        });
        after();
      },
    });

    if (onEditEntry) {
      items.push({
        id: 'editEntry',
        title: t('mobile.climbActions.editEntry'),
        icon: 'edit',
        color: accentColor,
        run: () => {
          onEditEntry();
          after();
        },
      });
    }

    if (isAuthenticated) {
      items.push({
        id: 'betaVideo',
        title: t('mobile.climbActions.addBetaVideo'),
        icon: 'video',
        color: accentColor,
        run: () => {
          openAddBetaVideo(climb, boardConfig);
          after();
        },
      });
    }

    if (canEdit) {
      items.push({
        id: 'edit',
        title: t('mobile.climbActions.edit'),
        icon: 'edit',
        color: accentColor,
        run: () => {
          after();
          router.push({
            pathname: '/(tabs)/climbs/create',
            params: {
              editClimbUuid: climb.uuid,
              boardName,
              layoutId: String(layoutId),
              sizeId: String(sizeId),
              setIds,
              angle: String(angle),
            },
          });
        },
      });
    }

    items.push({
      id: 'fork',
      title: t('mobile.climbActions.fork'),
      icon: 'branch',
      color: accentColor,
      run: () => {
        after();
        router.push({
          pathname: '/(tabs)/climbs/create',
          params: {
            forkFrames: climb.frames,
            forkName: climb.name,
            forkDescription: climb.description ?? '',
            boardName,
            layoutId: String(layoutId),
            sizeId: String(sizeId),
            setIds,
            angle: String(angle),
          },
        });
      },
    });

    items.push({
      id: 'copyLink',
      title: t('mobile.climbActions.copyLink'),
      icon: 'copy',
      color: accentColor,
      run: () => {
        void (async () => {
          try {
            const url = `${WEB_BASE_URL}${buildClimbViewPath(boardName, layoutId, sizeId, setIds, angle, climb.uuid)}`;
            await Clipboard.setStringAsync(url);
            track(SHARED_EVENTS.ClimbShared, { method: 'copy_link', climbUuid: climb.uuid, boardName, layoutId });
            showToast(t('mobile.climbActions.linkCopied'), 'info');
          } finally {
            after();
          }
        })();
      },
    });

    if (auroraAppUrl) {
      items.push({
        id: 'openInApp',
        title: t('mobile.climbActions.openInApp'),
        icon: 'open.external',
        color: accentColor,
        run: () => {
          void (async () => {
            try {
              track(SHARED_EVENTS.OpenInAuroraApp, { climbUuid: climb.uuid, boardName, layoutId });
              await WebBrowser.openBrowserAsync(auroraAppUrl);
            } finally {
              after();
            }
          })();
        },
      });
    }

    return items;
  }, [
    climb,
    boardConfig,
    currentUserId,
    isAuthenticated,
    onEditEntry,
    after,
    t,
    actionColors,
    router,
    showToast,
    addToQueue,
    toggleFavoriteMutate,
    openPlayDrawer,
    openAddToPlaylist,
    openLogAscent,
    openAddBetaVideo,
    activeBoardConfig,
  ]);
}
