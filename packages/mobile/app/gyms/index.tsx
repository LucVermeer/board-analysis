import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { UserBoard } from '@boardsesh/shared-schema';
import { useNearbyBoards, useNearbyGyms } from '../../src/lib/graphql/hooks';
import { useSetActiveBoard } from '../../src/lib/graphql/use-active-board';
import { useDeviceLocation, type Coords } from '../../src/lib/use-device-location';
import { useGeocodePlace } from '../../src/lib/use-place-search';
import { useToast } from '../../src/providers/toast-provider';
import { useTheme } from '../../src/providers/theme-provider';
import { hapticSelection } from '../../src/lib/haptics';
import { resolveBoardReturnTo } from '../../src/lib/boards/board-return-to';
import { Text } from '../../src/components/Text';
import { Icon } from '../../src/components/Icon';
import { Button } from '../../src/components/Button';
import { ActivityIndicator } from '../../src/components/ActivityIndicator';
import { GymMap, type GymMapMarker } from '../../src/components/gym-directory/GymMap';
import { spacing, borderRadius } from '../../src/theme/tokens';

/**
 * Gym-first board discovery: find a gym (or a standalone board) on the map / in
 * the list and pick its board. The location search bar geocodes a typed place
 * ("Blackheath NSW") so you can browse anywhere — not just your GPS fix — and
 * the same text filters gyms/boards by name. The list is the primary
 * interaction so the flow still works where the native map is blank (Android
 * without a Google Maps key). Selecting a board makes it the active named board.
 */
export default function GymDiscovery() {
  const router = useRouter();
  const { t } = useTranslation('boards');
  const { showToast } = useToast();
  const { systemColors } = useTheme();
  const location = useDeviceLocation();
  const { geocode, isGeocoding } = useGeocodePlace();
  const setActiveBoard = useSetActiveBoard();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const boardReturnTo = resolveBoardReturnTo(returnTo);
  const [expandedGymUuid, setExpandedGymUuid] = useState<string | null>(null);

  // The text in the field vs. the applied filters. `query` is the name filter
  // sent to the backend; `searchCenter`/`searchLabel` track a geocoded relocate.
  // Both apply on submit so typing doesn't fire a request per keystroke.
  const [inputText, setInputText] = useState('');
  const [query, setQuery] = useState('');
  const [searchCenter, setSearchCenter] = useState<Coords | null>(null);
  const [searchLabel, setSearchLabel] = useState<string | null>(null);

  // A searched place wins over the device fix; fall back to GPS otherwise.
  const center = searchCenter ?? location.coords;

  // Ask for location once on mount — the map + nearby queries default to it.
  // Read `request` through a ref so this fires exactly once (the hook is
  // one-shot); a typed place search works even if the user denies location.
  const requestLocationRef = useRef(location.request);
  requestLocationRef.current = location.request;
  useEffect(() => {
    void requestLocationRef.current();
  }, []);

  const { data: gymConnection, isLoading: gymsLoading } = useNearbyGyms(center, 50, query);
  const { data: boardConnection } = useNearbyBoards(center, 50, query, 50);

  const gyms = useMemo(
    () => (gymConnection?.gyms ?? []).filter((gym) => gym.latitude != null && gym.longitude != null),
    [gymConnection?.gyms],
  );
  const boards = boardConnection?.boards ?? [];

  // Boards not attached to a gym still deserve discovery — surface them as their
  // own pins + list section so consolidating onto the gym map loses nothing.
  const standaloneBoards = useMemo(
    () => boards.filter((board) => board.gymUuid == null && board.latitude != null && board.longitude != null),
    [boards],
  );

  const markers = useMemo<GymMapMarker[]>(
    () => [
      ...gyms.map((gym) => ({
        id: gym.uuid,
        latitude: gym.latitude as number,
        longitude: gym.longitude as number,
        name: gym.name,
      })),
      ...standaloneBoards.map((board) => ({
        id: board.uuid,
        latitude: board.latitude as number,
        longitude: board.longitude as number,
        name: board.name,
      })),
    ],
    [gyms, standaloneBoards],
  );

  const boardsForGym = useCallback((gymUuid: string) => boards.filter((board) => board.gymUuid === gymUuid), [boards]);

  const activate = useCallback(
    async (board: UserBoard) => {
      hapticSelection();
      try {
        await setActiveBoard(board);
        router.dismissTo(boardReturnTo);
      } catch {
        showToast(t('mobile.boardSwitchError'), 'error');
      }
    },
    [setActiveBoard, router, boardReturnTo, showToast, t],
  );

  // One bar, two jobs: if the text resolves to a place, relocate there and show
  // everything nearby; otherwise treat it as a name filter at the current spot.
  // We deliberately don't AND the two — a place name ("Tokyo") would otherwise
  // hide every gym not literally named after it. State is set together per
  // branch (after the await) so the map + queries never flash at a stale center.
  const onSubmitSearch = useCallback(async () => {
    const text = inputText.trim();
    setExpandedGymUuid(null);
    if (!text) {
      setSearchCenter(null);
      setSearchLabel(null);
      setQuery('');
      return;
    }
    const coords = await geocode(text);
    if (coords) {
      setSearchCenter(coords);
      setSearchLabel(text);
      setQuery('');
    } else {
      setQuery(text);
    }
  }, [inputText, geocode]);

  // Clear everything and snap back to the device location.
  const clearSearch = useCallback(() => {
    setInputText('');
    setQuery('');
    setSearchCenter(null);
    setSearchLabel(null);
    setExpandedGymUuid(null);
  }, []);

  const screen = <Stack.Screen options={{ title: t('mobile.gyms.title') }} />;

  const searchBar = (
    <View style={styles.searchWrap}>
      <View style={[styles.searchField, { backgroundColor: systemColors.secondaryBackground }]}>
        <Icon name="search" size={18} color={systemColors.secondaryLabel} />
        <TextInput
          value={inputText}
          onChangeText={setInputText}
          onSubmitEditing={() => void onSubmitSearch()}
          placeholder={t('mobile.gyms.searchPlaceholder')}
          placeholderTextColor={systemColors.tertiaryLabel}
          style={[styles.searchInput, { color: systemColors.label }]}
          autoCorrect={false}
          returnKeyType="search"
        />
        {isGeocoding ? <ActivityIndicator /> : null}
        {inputText.length > 0 || searchLabel ? (
          <Pressable onPress={clearSearch} hitSlop={8} accessibilityLabel={t('mobile.gyms.clearSearch')}>
            <Icon name="close" size={18} color={systemColors.secondaryLabel} />
          </Pressable>
        ) : null}
      </View>
      {searchLabel ? (
        <Text variant="caption1" color={systemColors.secondaryLabel} style={styles.showingPlace}>
          {t('mobile.gyms.showingPlace', { place: searchLabel })}
        </Text>
      ) : null}
    </View>
  );

  // No place to show yet: prompt for location (the search bar above still works
  // for browsing a typed place without granting it).
  if (!center) {
    const waiting = location.status === 'idle' || location.status === 'loading';
    return (
      <View style={styles.flex}>
        {screen}
        {searchBar}
        <View style={styles.center}>
          {waiting ? (
            <ActivityIndicator size="large" />
          ) : (
            <>
              <Icon name="location" size={40} color={systemColors.tertiaryLabel} />
              <Text variant="subheadline" color={systemColors.secondaryLabel} style={styles.centerText}>
                {t('mobile.gyms.locationNeeded')}
              </Text>
              <Button
                title={t('mobile.gyms.grantLocation')}
                variant="outlined"
                // After a denial the one-shot hook won't re-prompt (iOS only
                // asks once), so send the user to Settings instead of a no-op.
                onPress={() => {
                  if (location.status === 'denied') {
                    void Linking.openSettings();
                  } else {
                    void location.request();
                  }
                }}
                style={styles.centerButton}
              />
            </>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      {screen}
      {searchBar}
      <View style={styles.mapContainer}>
        <GymMap center={center} markers={markers} />
      </View>

      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        <Text variant="footnote" color={systemColors.secondaryLabel} style={styles.sectionLabel}>
          {t('mobile.gyms.subtitle')}
        </Text>

        {gymsLoading && gyms.length === 0 ? <ActivityIndicator style={styles.listSpinner} /> : null}

        {!gymsLoading && gyms.length === 0 ? (
          <Text variant="subheadline" color={systemColors.secondaryLabel} style={styles.empty}>
            {t('mobile.gyms.empty')}
          </Text>
        ) : null}

        {gyms.map((gym) => {
          const expanded = expandedGymUuid === gym.uuid;
          const gymBoards = boardsForGym(gym.uuid);
          return (
            <View key={gym.uuid} style={[styles.gymBlock, { borderColor: systemColors.separator }]}>
              <Pressable onPress={() => setExpandedGymUuid(expanded ? null : gym.uuid)} style={styles.gymRow}>
                <Icon name="pin" size={20} color={systemColors.label} />
                <View style={styles.gymText}>
                  <Text variant="headline">{gym.name}</Text>
                  <Text variant="subheadline" color={systemColors.secondaryLabel}>
                    {gym.address ?? t('mobile.gyms.boardCount', { count: gym.boardCount ?? gymBoards.length })}
                  </Text>
                </View>
                <Icon name={expanded ? 'minus' : 'add'} size={20} color={systemColors.tertiaryLabel} />
              </Pressable>

              {expanded ? (
                gymBoards.length > 0 ? (
                  gymBoards.map((board) => (
                    <Pressable
                      key={board.uuid}
                      onPress={() => void activate(board)}
                      style={[styles.boardRow, { borderTopColor: systemColors.separator }]}
                    >
                      <Icon name="boards" size={18} color={systemColors.secondaryLabel} />
                      <View style={styles.gymText}>
                        <Text variant="subheadline">{board.name}</Text>
                        <Text variant="caption1" color={systemColors.tertiaryLabel}>
                          {board.boardType}
                        </Text>
                      </View>
                    </Pressable>
                  ))
                ) : (
                  <Text variant="caption1" color={systemColors.tertiaryLabel} style={styles.noBoards}>
                    {t('mobile.gyms.noBoards')}
                  </Text>
                )
              ) : null}
            </View>
          );
        })}

        {standaloneBoards.length > 0 ? (
          <>
            <Text variant="footnote" color={systemColors.secondaryLabel} style={styles.sectionLabel}>
              {t('mobile.gyms.otherBoardsTitle')}
            </Text>
            {standaloneBoards.map((board) => (
              <Pressable
                key={board.uuid}
                onPress={() => void activate(board)}
                style={[styles.gymBlock, styles.standaloneRow, { borderColor: systemColors.separator }]}
              >
                <Icon name="boards" size={20} color={systemColors.label} />
                <View style={styles.gymText}>
                  <Text variant="headline">{board.name}</Text>
                  <Text variant="subheadline" color={systemColors.secondaryLabel}>
                    {board.locationName ?? board.boardType}
                  </Text>
                </View>
                <Icon name="chevron.right" size={18} color={systemColors.tertiaryLabel} />
              </Pressable>
            ))}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  searchWrap: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[2],
    paddingBottom: spacing[1],
    gap: spacing[1],
  },
  searchField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[3],
    height: 44,
    borderRadius: borderRadius.lg,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
  },
  showingPlace: {
    paddingHorizontal: spacing[1],
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[3],
    padding: spacing[6],
  },
  centerText: {
    textAlign: 'center',
  },
  centerButton: {
    marginTop: spacing[2],
  },
  mapContainer: {
    height: 260,
  },
  list: {
    padding: spacing[4],
    paddingBottom: spacing[8],
    gap: spacing[2],
  },
  sectionLabel: {
    textTransform: 'uppercase',
    marginBottom: spacing[1],
    marginTop: spacing[2],
  },
  listSpinner: {
    marginTop: spacing[4],
  },
  empty: {
    marginTop: spacing[4],
    textAlign: 'center',
  },
  gymBlock: {
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  gymRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    padding: spacing[3],
  },
  gymText: {
    flex: 1,
  },
  boardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    paddingLeft: spacing[6],
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  standaloneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    padding: spacing[3],
  },
  noBoards: {
    paddingHorizontal: spacing[3],
    paddingBottom: spacing[3],
    paddingLeft: spacing[6],
  },
});
