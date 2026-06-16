import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { PublicUserProfile } from '@boardsesh/shared-schema';
import { ActivityIndicator } from '../../src/components/ActivityIndicator';
import {
  ClimberSearchEmptyState,
  ClimberSearchErrorState,
  ClimberSearchLoadingState,
  ClimberSearchPersonRow,
  mapSearchResults,
  useDebouncedClimberSearch,
  type SocialPerson,
} from '../../src/components/you/ClimberSearch';
import { useProfile, useSearchUsers, useToggleUserFollow } from '../../src/lib/graphql/hooks';
import { useBottomChromeMetrics } from '../../src/hooks/use-bottom-chrome-metrics';
import { useTheme } from '../../src/providers/theme-provider';
import { spacing } from '../../src/theme/tokens';

const EMPTY_PEOPLE: SocialPerson[] = [];

// The native header search bar reports changes as either a string or a
// synthetic event depending on platform — normalise both (mirrors the Climbs tab).
type NativeSearchChange = string | { nativeEvent?: { text?: string } };
function readNativeSearchText(change: NativeSearchChange): string {
  return typeof change === 'string' ? change : (change.nativeEvent?.text ?? '');
}

export default function ClimberSearchScreen() {
  const { t } = useTranslation('feed');
  const { t: tYou } = useTranslation('you');
  const { systemColors } = useTheme();
  const bottomChrome = useBottomChromeMetrics();
  const paddingBottom = bottomChrome.scrollBottomPadding + spacing[4];

  const { data: currentProfile } = useProfile();
  const currentUserId = currentProfile?.id;

  const [searchQuery, setSearchQuery] = useState('');
  const { trimmedSearchQuery, debouncedSearchQuery, searchIsDebouncing, canUseSearchQuery } =
    useDebouncedClimberSearch(searchQuery);

  const search = useSearchUsers(debouncedSearchQuery, canUseSearchQuery);
  const toggleFollow = useToggleUserFollow(currentUserId);

  const handleSearchChange = useCallback((change: NativeSearchChange) => {
    setSearchQuery(readNativeSearchText(change));
  }, []);

  // Drive the search input from the native nav-bar search controller: it owns
  // the keyboard (autoFocus pops it on arrival) and stays out of the content,
  // so the results FlashList just insets below it via contentInsetAdjustment.
  const stackOptions = useMemo(
    () => ({
      headerShown: true,
      title: t('mobile.home.findClimbersTitle'),
      headerSearchBarOptions: {
        placeholder: tYou('mobile.social.searchPlaceholder'),
        autoFocus: true,
        autoCapitalize: 'none' as const,
        hideWhenScrolling: false,
        onChangeText: handleSearchChange,
        onCancelButtonPress: () => setSearchQuery(''),
      },
    }),
    [t, tYou, handleSearchChange],
  );

  const people = useMemo(
    () => search.data?.pages.flatMap((page) => mapSearchResults(page.results)) ?? EMPTY_PEOPLE,
    [search.data],
  );

  const handleToggleFollow = useCallback(
    (person: PublicUserProfile) => {
      if (person.id === currentUserId) return;
      toggleFollow.mutate({ userId: person.id, isFollowedByMe: person.isFollowedByMe });
    },
    [currentUserId, toggleFollow],
  );

  const handleEndReached = useCallback(() => {
    if (canUseSearchQuery && search.hasNextPage && !search.isFetchingNextPage) void search.fetchNextPage();
  }, [canUseSearchQuery, search]);

  const renderItem = useCallback(
    ({ item }: { item: SocialPerson }) => {
      const isRowMutating = toggleFollow.isPending && toggleFollow.variables?.userId === item.id;
      return (
        <ClimberSearchPersonRow
          person={item}
          currentUserId={currentUserId}
          isMutating={isRowMutating}
          onToggleFollow={handleToggleFollow}
        />
      );
    },
    [currentUserId, handleToggleFollow, toggleFollow.isPending, toggleFollow.variables?.userId],
  );

  const showHint = trimmedSearchQuery.length < 2;
  const showInitialSpinner = !showHint && (searchIsDebouncing || (search.isPending && people.length === 0));
  const showError = !showHint && !searchIsDebouncing && search.isError && people.length === 0;
  const visiblePeople = showInitialSpinner || showHint || showError ? EMPTY_PEOPLE : people;

  return (
    <View style={[styles.flex, { backgroundColor: systemColors.background }]}>
      <Stack.Screen options={stackOptions} />

      <FlashList
        data={visiblePeople}
        renderItem={renderItem}
        keyExtractor={(person) => person.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingBottom }}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={
          showInitialSpinner ? (
            <ClimberSearchLoadingState />
          ) : showError ? (
            <ClimberSearchErrorState onRetry={() => void search.refetch()} />
          ) : (
            <ClimberSearchEmptyState query={trimmedSearchQuery} />
          )
        }
        ListFooterComponent={
          search.isFetchingNextPage ? (
            <View style={styles.footer}>
              <ActivityIndicator size="small" />
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  footer: {
    paddingVertical: spacing[5],
    alignItems: 'center',
  },
});
