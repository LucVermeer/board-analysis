import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useNavigation } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { PublicUserProfile } from '@boardsesh/shared-schema';
import { ActivityIndicator } from '../../src/components/ActivityIndicator';
import {
  ClimberSearchEmptyState,
  ClimberSearchErrorState,
  ClimberSearchField,
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

export default function ClimberSearchScreen() {
  const { t } = useTranslation('feed');
  const { systemColors } = useTheme();
  const navigation = useNavigation();
  const bottomChrome = useBottomChromeMetrics();
  const paddingBottom = bottomChrome.scrollBottomPadding + spacing[4];

  const { data: currentProfile } = useProfile();
  const currentUserId = currentProfile?.id;

  const [searchQuery, setSearchQuery] = useState('');
  const { trimmedSearchQuery, debouncedSearchQuery, searchIsDebouncing, canUseSearchQuery } =
    useDebouncedClimberSearch(searchQuery);

  const search = useSearchUsers(debouncedSearchQuery, canUseSearchQuery);
  const toggleFollow = useToggleUserFollow(currentUserId);

  useEffect(() => {
    navigation.setOptions({ headerShown: true, title: t('mobile.home.findClimbersTitle') });
  }, [navigation, t]);

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
      <View style={styles.searchWrap}>
        <ClimberSearchField value={searchQuery} onChangeText={setSearchQuery} />
      </View>

      <FlashList
        data={visiblePeople}
        renderItem={renderItem}
        keyExtractor={(person) => person.id}
        keyboardShouldPersistTaps="handled"
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
  searchWrap: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    paddingBottom: spacing[2],
  },
  footer: {
    paddingVertical: spacing[5],
    alignItems: 'center',
  },
});
