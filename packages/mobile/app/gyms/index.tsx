import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { UserBoard } from '@boardsesh/shared-schema';
import { useNearbyBoards, useNearbyGyms } from '../../src/lib/graphql/hooks';
import { useSetActiveBoard } from '../../src/lib/graphql/use-active-board';
import { useDeviceLocation } from '../../src/lib/use-device-location';
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
 * Gym-first board discovery: find a nearby gym on the map (or in the list) and
 * pick its board. The list is the primary interaction so the flow works even
 * where the native map is blank (Android without a Google Maps key). Selecting
 * a board makes it the active named board (resolveBoardForUuid downstream).
 */
export default function GymDiscovery() {
  const router = useRouter();
  const { t } = useTranslation('boards');
  const { showToast } = useToast();
  const { systemColors } = useTheme();
  const location = useDeviceLocation();
  const setActiveBoard = useSetActiveBoard();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const boardReturnTo = resolveBoardReturnTo(returnTo);
  const [expandedGymUuid, setExpandedGymUuid] = useState<string | null>(null);

  // Ask for location once on mount — the map + nearby gyms both need it. Read
  // `request` through a ref so this fires exactly once (the hook is one-shot).
  const requestLocationRef = useRef(location.request);
  requestLocationRef.current = location.request;
  useEffect(() => {
    void requestLocationRef.current();
  }, []);

  const { data: gymConnection, isLoading: gymsLoading } = useNearbyGyms(location.coords, 50);
  const { data: boardConnection } = useNearbyBoards(location.coords, 50);

  const gyms = useMemo(
    () => (gymConnection?.gyms ?? []).filter((gym) => gym.latitude != null && gym.longitude != null),
    [gymConnection?.gyms],
  );
  const boards = boardConnection?.boards ?? [];

  const markers = useMemo<GymMapMarker[]>(
    () =>
      gyms.map((gym) => ({
        id: gym.uuid,
        latitude: gym.latitude as number,
        longitude: gym.longitude as number,
        name: gym.name,
      })),
    [gyms],
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

  const screen = <Stack.Screen options={{ title: t('mobile.gyms.title') }} />;

  if (!location.coords) {
    const waiting = location.status === 'idle' || location.status === 'loading';
    return (
      <View style={styles.center}>
        {screen}
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
              onPress={() => void location.request()}
              style={styles.centerButton}
            />
          </>
        )}
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      {screen}
      <View style={styles.mapContainer}>
        <GymMap center={location.coords} markers={markers} />
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
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
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
  noBoards: {
    paddingHorizontal: spacing[3],
    paddingBottom: spacing[3],
    paddingLeft: spacing[6],
  },
});
