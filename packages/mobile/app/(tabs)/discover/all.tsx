import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useUserPlaylists } from '@boardsesh/playlists-react';
import type { Playlist } from '@boardsesh/graphql/operations/playlists';
import { Text } from '../../../src/components/Text';
import { Icon } from '../../../src/components/Icon';
import { ActivityIndicator } from '../../../src/components/ActivityIndicator';
import { PlaylistListRow } from '../../../src/components/playlist';
import { useAuth } from '../../../src/providers/auth-provider';
import { useTheme } from '../../../src/providers/theme-provider';
import { useAuthToken } from '../../../src/lib/graphql/use-auth-token';
import { useActiveBoard } from '../../../src/lib/graphql/use-active-board';
import { useBottomChromeMetrics } from '../../../src/hooks/use-bottom-chrome-metrics';
import { sortAndFilterPlaylists } from '../../../src/lib/sort-filter-playlists';
import { iosSystemColors } from '../../../src/theme/ios-colors';
import { spacing } from '../../../src/theme/tokens';

/**
 * "My Playlists" — the full, vertical, alphabetical list of the signed-in user's
 * own playlists with a title filter. The horizontal "Jump Back In" shelf on
 * Discover surfaces a few by recency; this expands it so a categorized library
 * (move type, projects at an angle) is easy to scan and search. Auto-generated /
 * smart playlists never appear here — they come from separate queries, so
 * `useUserPlaylists` already returns owned playlists only.
 */
export default function AllPlaylistsScreen() {
  const { t } = useTranslation('playlists');
  const { systemColors, brandColors } = useTheme();
  const bottomChrome = useBottomChromeMetrics();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { data: token = null } = useAuthToken();
  const { data: activeBoard } = useActiveBoard();

  const effectiveToken = isAuthenticated ? token : null;

  // Scope to the active board (matching the Discover hub's board filter), so this
  // screen is the full version of the "Jump Back In" shelf it expands.
  const { playlists, isLoading, isLoadingMore, hasMore, loadMore } = useUserPlaylists({
    token: effectiveToken,
    boardType: activeBoard?.boardType,
    layoutId: activeBoard?.layoutId,
    pageSize: 50,
  });

  // Drain every page so the alphabetical sort + title filter see the whole
  // library, not just the first page.
  useEffect(() => {
    if (hasMore && !isLoadingMore && !isLoading) loadMore();
  }, [hasMore, isLoadingMore, isLoading, loadMore]);

  const [query, setQuery] = useState('');

  const filtered = useMemo(() => sortAndFilterPlaylists(playlists, query), [playlists, query]);

  const goToPlaylist = useCallback((uuid: string) => {
    router.push(`/(tabs)/discover/${uuid}`);
  }, []);

  const renderItem = useCallback(
    ({ item, index }: { item: Playlist; index: number }) => (
      <PlaylistListRow
        name={item.name}
        climbCount={item.climbCount}
        color={item.color}
        icon={item.icon}
        index={index}
        onPress={() => goToPlaylist(item.uuid)}
        showSeparator={index < filtered.length - 1}
      />
    ),
    [filtered.length, goToPlaylist],
  );

  // Signed-out (reachable only via deep link — the entry points are gated on auth).
  if (!isAuthenticated && !authLoading) {
    return (
      <View style={[styles.flex, styles.centered, { backgroundColor: systemColors.background }]}>
        <Icon name="person" size={48} color={iosSystemColors.systemGray4} />
        <Text variant="headline" style={styles.stateTitle}>
          {t('library.signInBanner.title')}
        </Text>
        <Pressable onPress={() => router.push('/auth/login')} accessibilityRole="button" hitSlop={8}>
          <Text variant="subheadline" color={brandColors.primary} style={styles.stateCta}>
            {t('library.signInBanner.cta')}
          </Text>
        </Pressable>
      </View>
    );
  }

  const showInitialSpinner = isLoading && playlists.length === 0;
  const showDrainingFooter = !showInitialSpinner && (isLoadingMore || hasMore);

  return (
    <View style={[styles.flex, { backgroundColor: systemColors.background }]}>
      <View style={styles.searchWrap}>
        <View style={[styles.searchField, { backgroundColor: systemColors.fill }]}>
          <Icon name="search" size={18} color={systemColors.secondaryLabel} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('library.allPlaylists.searchPlaceholder')}
            placeholderTextColor={iosSystemColors.systemGray}
            style={[styles.searchInput, { color: systemColors.label }]}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            clearButtonMode="while-editing"
            accessibilityLabel={t('library.allPlaylists.searchPlaceholder')}
          />
          {query.length > 0 ? (
            <Pressable
              onPress={() => setQuery('')}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('library.allPlaylists.searchPlaceholder')}
            >
              <Icon name="close" size={16} color={systemColors.secondaryLabel} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {showInitialSpinner ? (
        <View style={[styles.flex, styles.centered]}>
          <ActivityIndicator size="large" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.uuid}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: bottomChrome.scrollBottomPadding + spacing[6] }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          ListEmptyComponent={
            <View style={[styles.centered, styles.emptyBlock]}>
              <Icon name="playlist" size={48} color={iosSystemColors.systemGray4} />
              <Text variant="headline" style={styles.stateTitle}>
                {playlists.length === 0
                  ? t('library.empty.title')
                  : t('library.allPlaylists.noResults', { query: query.trim() })}
              </Text>
              {playlists.length === 0 ? (
                <Text variant="subheadline" style={styles.stateSubtitle}>
                  {t('library.empty.description')}
                </Text>
              ) : null}
            </View>
          }
          ListFooterComponent={
            showDrainingFooter ? (
              <View style={styles.footer}>
                <ActivityIndicator size="small" />
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchWrap: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[2],
    paddingBottom: spacing[2],
  },
  searchField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    height: 40,
    borderRadius: 10,
    paddingHorizontal: spacing[3],
  },
  searchInput: {
    flex: 1,
    fontSize: 17,
    paddingVertical: 0,
  },
  emptyBlock: {
    paddingTop: spacing[10] * 2,
    paddingHorizontal: 32,
    gap: 8,
  },
  stateTitle: {
    marginTop: 12,
    opacity: 0.6,
    textAlign: 'center',
  },
  stateSubtitle: {
    opacity: 0.4,
    textAlign: 'center',
  },
  stateCta: {
    marginTop: 12,
    fontWeight: '600',
  },
  footer: {
    paddingVertical: spacing[4],
    alignItems: 'center',
  },
});
