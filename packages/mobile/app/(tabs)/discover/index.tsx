import { useCallback, useMemo, useRef, useState } from 'react';
import { View, ScrollView, Pressable, StyleSheet } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  useDiscoverPlaylists,
  useUserPlaylists,
  usePinnedPlaylists,
  useSmartPlaylistCounts,
  usePlaylistMutations,
} from '@boardsesh/playlists-react';
import type { DiscoverablePlaylist, Playlist } from '@boardsesh/graphql/operations/playlists';
import { Text } from '../../../src/components/Text';
import { Icon } from '../../../src/components/Icon';
import { ActivityIndicator } from '../../../src/components/ActivityIndicator';
import { SectionHeader } from '../../../src/components/SectionHeader';
import {
  PlaylistCard,
  PlaylistScrollSection,
  BoardFilterStrip,
  CreatePlaylistFab,
  PlaylistFormSheet,
  type PlaylistFormValues,
} from '../../../src/components/playlist';
import type { BoardFilterSelection } from '../../../src/components/playlist';
import { SMART_PLAYLISTS } from '../../../src/lib/smart-playlists';
import { useAuth } from '../../../src/providers/auth-provider';
import { useToast } from '../../../src/providers/toast-provider';
import { useAuthToken } from '../../../src/lib/graphql/use-auth-token';
import { useMyBoards, useProfile } from '../../../src/lib/graphql/hooks';
import { useActiveBoard } from '../../../src/lib/graphql/use-active-board';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BAR_CONTENT_HEIGHT, TAB_BAR_HEIGHT } from '../../../src/components/queue-control/persistent-queue-bar';
import { brandColors } from '../../../src/theme/colors';
import { iosSystemColors } from '../../../src/theme/ios-colors';
import { spacing } from '../../../src/theme/tokens';

export default function DiscoverLibrary() {
  const { t } = useTranslation('playlists');
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { data: token = null, isLoading: tokenLoading } = useAuthToken();
  const { data: profile } = useProfile();
  const { data: activeBoard } = useActiveBoard();
  const { data: myBoards } = useMyBoards(undefined, { enabled: isAuthenticated });

  const userId = profile?.id ?? null;
  const effectiveToken = isAuthenticated ? token : null;

  // Board filter — defaults to "All". Selecting a chip scopes every section to
  // that board's boardType + layoutId (the shared hooks reset on filter change).
  const boards = useMemo(() => myBoards?.boards ?? [], [myBoards]);
  const [boardFilter, setBoardFilter] = useState<BoardFilterSelection | null>(null);
  const filterBoardType = boardFilter?.boardType;
  const filterLayoutId = boardFilter?.layoutId;

  // Smart-playlist counts gate which "Your Picks" cards render.
  const { data: smartCounts, isLoading: smartCountsLoading } = useSmartPlaylistCounts({
    token: effectiveToken,
    tokenLoading,
    isAuthenticated,
  });

  // Owned playlists (paginated). Feeds "Jump Back In" + the pinned fallback pool.
  const {
    playlists: userPlaylists,
    isLoading: userLoading,
    isLoadingMore: userLoadingMore,
    loadMore: loadMoreUser,
    refetch: refetchUser,
  } = useUserPlaylists({
    token: effectiveToken,
    boardType: filterBoardType,
    layoutId: filterLayoutId,
    pageSize: 20,
  });

  const { pinned: pinnedPlaylists, refetch: refetchPinned } = usePinnedPlaylists({
    token: effectiveToken,
    boardType: filterBoardType,
    layoutId: filterLayoutId,
    candidatePlaylists: userPlaylists,
  });

  // Community playlists (popular + recent streams, merged).
  const {
    popular,
    recent,
    isLoading: discoverLoading,
    isLoadingMore: discoverLoadingMore,
    loadMore: loadMoreDiscover,
  } = useDiscoverPlaylists({
    boardType: filterBoardType,
    layoutId: filterLayoutId,
    pageSize: 10,
  });

  // Pinned playlists lead "Jump Back In"; owned playlists follow with pinned
  // ones removed so they don't appear twice.
  const jumpBackIn = useMemo(() => {
    const pinnedUuids = new Set(pinnedPlaylists.map((playlist) => playlist.uuid));
    return [...pinnedPlaylists, ...userPlaylists.filter((playlist) => !pinnedUuids.has(playlist.uuid))];
  }, [pinnedPlaylists, userPlaylists]);

  // Merge popular + recent, de-duped and excluding the current user's own.
  const discoverItems = useMemo(() => {
    const merged: DiscoverablePlaylist[] = [];
    const seen = new Set<string>();
    for (const playlist of [...popular, ...recent]) {
      if (seen.has(playlist.uuid)) continue;
      if (userId && playlist.creatorId === userId) continue;
      seen.add(playlist.uuid);
      merged.push(playlist);
    }
    return merged;
  }, [popular, recent, userId]);

  const smartCardsToShow = useMemo(() => {
    if (!userId || !smartCounts) return [];
    return SMART_PLAYLISTS.map((preset) => {
      const found = smartCounts.find((entry) => entry.type === preset.type);
      return { preset, count: found?.count ?? 0 };
    }).filter((entry) => entry.count > 0);
  }, [userId, smartCounts]);

  const goToPlaylist = useCallback((uuid: string) => {
    router.push(`/(tabs)/discover/${uuid}`);
  }, []);

  const goToSmart = useCallback((type: string) => {
    router.push(`/(tabs)/discover/smart/${type}`);
  }, []);

  const { showToast } = useToast();
  const { createPlaylist, pinPlaylist, unpinPlaylist } = usePlaylistMutations();

  // Create flow — the FAB needs a board (boardType + layoutId). Prefer the
  // active board filter, fall back to the user's active board; with neither,
  // guide the user to pick a board first (mirrors web's "select a board").
  const createBoard = useMemo(() => {
    if (boardFilter) return { boardType: boardFilter.boardType, layoutId: boardFilter.layoutId };
    if (activeBoard) return { boardType: activeBoard.boardType, layoutId: activeBoard.layoutId };
    return null;
  }, [boardFilter, activeBoard]);

  const [createVisible, setCreateVisible] = useState(false);
  const [creating, setCreating] = useState(false);

  const handleCreatePress = useCallback(() => {
    if (!createBoard) {
      showToast(t('bottomTabBar.selectBoardForPlaylist'), 'info');
      router.push('/(tabs)/boards');
      return;
    }
    setCreateVisible(true);
  }, [createBoard, showToast, t]);

  const handleCreateSubmit = useCallback(
    async (values: PlaylistFormValues) => {
      if (!createBoard) return;
      setCreating(true);
      try {
        const created = await createPlaylist({
          boardType: createBoard.boardType,
          layoutId: createBoard.layoutId,
          name: values.name,
          description: values.description,
          color: values.color,
          icon: values.icon,
        });
        setCreateVisible(false);
        showToast(t('bottomTabBar.createdPlaylistToast', { name: created.name }), 'success');
        refetchUser();
        router.push(`/(tabs)/discover/${created.uuid}`);
      } catch (err) {
        console.error('Failed to create playlist:', err);
        showToast(t('bottomTabBar.createPlaylistFailed'), 'error');
      } finally {
        setCreating(false);
      }
    },
    [createBoard, createPlaylist, showToast, t, refetchUser],
  );

  // Pin / unpin straight from a "Jump Back In" card. The shared-hook arrays
  // aren't ours to mutate optimistically, so refetch both lists once the
  // mutation lands and let the pinned ordering + icon re-derive.
  const handleToggleCardPin = useCallback(
    async (playlist: Playlist) => {
      try {
        if (playlist.isPinnedByMe) await unpinPlaylist(playlist.uuid);
        else await pinPlaylist(playlist.uuid);
        refetchUser();
        refetchPinned();
      } catch (err) {
        console.error('Failed to toggle pin:', err);
        showToast(t(playlist.isPinnedByMe ? 'library.pin.unpinFailed' : 'library.pin.pinFailed'), 'error');
      }
    },
    [pinPlaylist, unpinPlaylist, refetchUser, refetchPinned, showToast, t],
  );

  // Refresh owned + pinned when returning to the tab (e.g. after editing,
  // deleting, or pinning from a detail screen). Skip the first focus so we
  // don't double-fetch what the hooks already load on mount.
  const hasFocusedRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!hasFocusedRef.current) {
        hasFocusedRef.current = true;
        return;
      }
      refetchUser();
      refetchPinned();
    }, [refetchUser, refetchPinned]),
  );

  const showSignInPrompt = !isAuthenticated && !authLoading;

  return (
    <View style={styles.flex}>
      <ScrollView
        style={styles.flex}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingBottom: BAR_CONTENT_HEIGHT + TAB_BAR_HEIGHT + insets.bottom + spacing[6] }}
        keyboardShouldPersistTaps="handled"
      >
        <BoardFilterStrip boards={boards} selectedBoardUuid={boardFilter?.uuid ?? null} onSelect={setBoardFilter} />

        {showSignInPrompt ? (
          <Pressable style={styles.signInBanner} onPress={() => router.push('/auth/login')} accessibilityRole="button">
            <Icon name="person" size={26} color={iosSystemColors.systemGray} />
            <View style={styles.signInText}>
              <Text variant="subheadline" style={styles.signInTitle}>
                {t('library.signInBanner.title')}
              </Text>
              <Text variant="caption1" style={styles.signInDescription}>
                {t('library.signInBanner.description')}
              </Text>
            </View>
            <Text variant="subheadline" color={brandColors.primary} style={styles.signInCta}>
              {t('library.signInBanner.cta')}
            </Text>
          </Pressable>
        ) : null}

        {/* Your Picks — smart-playlist grid (non-empty presets only). */}
        {smartCardsToShow.length > 0 ? (
          <View style={styles.section}>
            <SectionHeader title={t('library.sections.smart')} />
            <View style={styles.grid}>
              {smartCardsToShow.map(({ preset, count }, index) => (
                <View key={preset.slug} style={styles.gridItem}>
                  <PlaylistCard
                    name={t(preset.titleI18nKey)}
                    climbCount={count}
                    color={preset.color}
                    icon={preset.icon}
                    variant="grid"
                    index={index}
                    onPress={() => goToSmart(preset.type)}
                  />
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* Jump Back In — pinned + owned playlists. */}
        {isAuthenticated && (userLoading || jumpBackIn.length > 0) ? (
          <PlaylistScrollSection
            title={t('library.sections.jumpBackIn')}
            loading={userLoading && jumpBackIn.length === 0}
            isLoadingMore={userLoadingMore}
            onEndReached={loadMoreUser}
          >
            {jumpBackIn.map((playlist, index) => (
              <PlaylistCard
                key={playlist.uuid}
                name={playlist.name}
                climbCount={playlist.climbCount}
                color={playlist.color}
                icon={playlist.icon}
                variant="scroll"
                index={index}
                onPress={() => goToPlaylist(playlist.uuid)}
                isPinned={playlist.isPinnedByMe}
                onTogglePin={() => handleToggleCardPin(playlist)}
              />
            ))}
          </PlaylistScrollSection>
        ) : null}

        {/* Discover — community playlists. */}
        {discoverLoading || discoverItems.length > 0 ? (
          <PlaylistScrollSection
            title={t('library.sections.discover')}
            loading={discoverLoading && discoverItems.length === 0}
            isLoadingMore={discoverLoadingMore}
            onEndReached={loadMoreDiscover}
          >
            {discoverItems.map((playlist, index) => (
              <PlaylistCard
                key={playlist.uuid}
                name={playlist.name}
                climbCount={playlist.climbCount}
                color={playlist.color}
                icon={playlist.icon}
                variant="scroll"
                index={index}
                onPress={() => goToPlaylist(playlist.uuid)}
              />
            ))}
          </PlaylistScrollSection>
        ) : null}

        {/* Empty state: signed in, nothing anywhere, nothing loading. */}
        {isAuthenticated &&
        !userLoading &&
        !discoverLoading &&
        !smartCountsLoading &&
        jumpBackIn.length === 0 &&
        discoverItems.length === 0 &&
        smartCardsToShow.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Icon name="playlist" size={48} color={iosSystemColors.systemGray4} />
            <Text variant="headline" style={styles.emptyTitle}>
              {t('library.empty.title')}
            </Text>
            <Text variant="subheadline" style={styles.emptySubtitle}>
              {t('library.empty.description')}
            </Text>
          </View>
        ) : null}

        {/* Initial spinner before any section has resolved. */}
        {(authLoading || tokenLoading) && jumpBackIn.length === 0 && discoverItems.length === 0 ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" />
          </View>
        ) : null}
      </ScrollView>

      {isAuthenticated ? <CreatePlaylistFab onPress={handleCreatePress} /> : null}

      <PlaylistFormSheet
        mode="create"
        visible={createVisible}
        submitting={creating}
        onSubmit={handleCreateSubmit}
        onClose={() => setCreateVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  section: {
    marginTop: spacing[2],
    marginBottom: spacing[2],
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing[4],
    rowGap: spacing[4],
  },
  gridItem: {
    width: '50%',
    paddingRight: spacing[3],
  },
  signInBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    marginHorizontal: spacing[4],
    marginTop: spacing[3],
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: iosSystemColors.separator,
  },
  signInText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  signInTitle: {
    fontWeight: '600',
  },
  signInDescription: {
    opacity: 0.6,
  },
  signInCta: {
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: spacing[10] * 2,
    paddingHorizontal: 32,
    gap: 8,
  },
  emptyTitle: {
    marginTop: 12,
    opacity: 0.6,
  },
  emptySubtitle: {
    opacity: 0.4,
    textAlign: 'center',
  },
  loadingContainer: {
    paddingTop: spacing[10] * 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
