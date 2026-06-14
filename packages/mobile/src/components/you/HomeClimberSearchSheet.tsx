import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import {
  BottomSheetBackdrop,
  BottomSheetFlatList,
  BottomSheetModal,
  BottomSheetTextInput,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { FullWindowOverlay } from 'react-native-screens';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { PublicUserProfile } from '@boardsesh/shared-schema';
import { Text } from '../Text';
import { Icon } from '../Icon';
import { ActivityIndicator } from '../ActivityIndicator';
import { GlassSheetBackground } from '../GlassSheetBackground';
import {
  ClimberSearchEmptyState,
  ClimberSearchErrorState,
  ClimberSearchField,
  ClimberSearchLoadingState,
  ClimberSearchPersonRow,
  mapSearchResults,
  useDebouncedClimberSearch,
  type SocialPerson,
} from './ClimberSearch';
import { useSearchUsers, useToggleUserFollow } from '../../lib/graphql/hooks';
import { sheetStyles, spacing } from '../../theme/tokens';
import { useTheme } from '../../providers/theme-provider';

const EMPTY_PEOPLE: SocialPerson[] = [];
const SNAP_POINTS = ['65%', '92%'];
const sheetContainerComponent = Platform.OS === 'ios' ? SheetContainer : undefined;

function SheetContainer({ children }: { children?: ReactNode }) {
  return <FullWindowOverlay>{children}</FullWindowOverlay>;
}

type HomeClimberSearchSheetProps = {
  currentUserId: string | undefined;
};

export const HomeClimberSearchSheet = forwardRef<BottomSheetModal, HomeClimberSearchSheetProps>(
  function HomeClimberSearchSheet({ currentUserId }, ref) {
    const { t } = useTranslation('feed');
    const { systemColors, sheet } = useTheme();
    const insets = useSafeAreaInsets();
    const sheetRef = useRef<BottomSheetModal>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const { trimmedSearchQuery, debouncedSearchQuery, searchIsDebouncing, canUseSearchQuery } =
      useDebouncedClimberSearch(searchQuery);
    const isIdentityLoading = !currentUserId;
    const canSearch = !isIdentityLoading && canUseSearchQuery;

    const search = useSearchUsers(debouncedSearchQuery, canSearch);
    const toggleFollow = useToggleUserFollow(currentUserId);

    useImperativeHandle(ref, () => sheetRef.current as BottomSheetModal, []);

    const people = useMemo(
      () => search.data?.pages.flatMap((page) => mapSearchResults(page.results)) ?? EMPTY_PEOPLE,
      [search.data],
    );

    const handleDismiss = useCallback(() => {
      setSearchQuery('');
    }, []);

    const handleClose = useCallback(() => {
      sheetRef.current?.dismiss();
    }, []);

    const handleRetry = useCallback(() => {
      if (canSearch) void search.refetch();
    }, [canSearch, search]);

    const handleEndReached = useCallback(() => {
      if (canSearch && search.hasNextPage && !search.isFetchingNextPage) {
        void search.fetchNextPage();
      }
    }, [canSearch, search]);

    const handleToggleFollow = useCallback(
      (person: PublicUserProfile) => {
        if (person.id === currentUserId) return;
        toggleFollow.mutate({ userId: person.id, isFollowedByMe: person.isFollowedByMe });
      },
      [currentUserId, toggleFollow],
    );

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

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop
          {...props}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
          opacity={sheet.scrimOpacity}
          pressBehavior="close"
        />
      ),
      [sheet.scrimOpacity],
    );

    const searchInputComponent = BottomSheetTextInput as ComponentProps<typeof ClimberSearchField>['inputComponent'];
    const showHint = trimmedSearchQuery.length < 2;
    const showIdentityLoading = isIdentityLoading && !showHint;
    const showInitialSpinner =
      showIdentityLoading || searchIsDebouncing || (!showHint && search.isPending && people.length === 0);
    const showError = !showHint && !showIdentityLoading && !searchIsDebouncing && search.isError && people.length === 0;
    const visiblePeople = showInitialSpinner || showHint || showError ? EMPTY_PEOPLE : people;

    const backgroundStyle = {
      ...sheetStyles.background,
      ...sheet.corners,
      backgroundColor: systemColors.secondaryBackground,
    };

    return (
      <BottomSheetModal
        ref={sheetRef}
        index={0}
        snapPoints={SNAP_POINTS}
        enableDynamicSizing={false}
        enablePanDownToClose
        stackBehavior="push"
        backdropComponent={renderBackdrop}
        backgroundComponent={GlassSheetBackground}
        backgroundStyle={backgroundStyle}
        handleIndicatorStyle={sheet.handleStyle}
        containerComponent={sheetContainerComponent}
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        android_keyboardInputMode="adjustResize"
        onDismiss={handleDismiss}
        style={styles.sheet}
      >
        <BottomSheetView style={[styles.header, { borderBottomColor: systemColors.separator }]}>
          <Pressable
            onPress={handleClose}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('mobile.home.closeSearch')}
            style={styles.headerAction}
          >
            <Icon name="chevron.down" size={20} color={systemColors.secondaryLabel} />
          </Pressable>
          <Text variant="title3" color={systemColors.label} numberOfLines={1} style={styles.headerTitle}>
            {t('mobile.home.findClimbersTitle')}
          </Text>
          <View pointerEvents="none" style={styles.headerAction} />
        </BottomSheetView>

        <BottomSheetView style={styles.searchWrap}>
          <ClimberSearchField value={searchQuery} onChangeText={setSearchQuery} inputComponent={searchInputComponent} />
        </BottomSheetView>

        <BottomSheetFlatList
          data={visiblePeople}
          keyExtractor={(person: SocialPerson) => person.id}
          renderItem={renderItem}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.5}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing[4] }}
          ListEmptyComponent={
            showInitialSpinner ? (
              <ClimberSearchLoadingState />
            ) : showError ? (
              <ClimberSearchErrorState onRetry={handleRetry} />
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
      </BottomSheetModal>
    );
  },
);

const styles = StyleSheet.create({
  sheet: {
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
      },
      android: {
        elevation: 16,
      },
    }),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[3],
    paddingTop: spacing[1],
    paddingBottom: spacing[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerAction: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontWeight: '600',
  },
  searchWrap: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  footer: {
    paddingVertical: spacing[5],
    alignItems: 'center',
  },
});
