import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, TextInput, StyleSheet, Platform, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { UserBoard } from '@boardsesh/shared-schema';
import { useSetActiveBoard } from '../../../src/lib/graphql/use-active-board';
import { useSearchBoardsMap } from '../../../src/lib/graphql/use-search-boards-map';
import { useDeviceLocation } from '../../../src/lib/use-device-location';
import { useToast } from '../../../src/providers/toast-provider';
import { useTheme } from '../../../src/providers/theme-provider';
import { hapticSelection } from '../../../src/lib/haptics';
import { Text } from '../../../src/components/Text';
import { Icon } from '../../../src/components/Icon';
import { BoardCarousel } from '../../../src/components/board-discovery/BoardCarousel';
import { userBoardToItem } from '../../../src/components/board-discovery/board-items';
import type { DiscoveryBoardItem } from '../../../src/components/board-discovery/BoardDiscoveryCard';
import { brandColors } from '../../../src/theme/colors';
import { spacing, borderRadius } from '../../../src/theme/tokens';

// Lazy/guarded expo-maps load: it's a native module, so a JS-only OTA push to a
// build that predates it would otherwise throw at import. We resolve the
// platform map view at module scope and fall back to a "needs an app update"
// placeholder when it's unavailable — search-by-text still works without a map.
type MapModule = typeof import('expo-maps');
let expoMaps: MapModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  expoMaps = require('expo-maps') as MapModule;
} catch {
  expoMaps = null;
}

// Neutral world view until the user's location resolves (mirrors web defaults).
const DEFAULT_CENTER = { latitude: 20, longitude: 0 };
const DEFAULT_ZOOM = 3;
const NEARBY_ZOOM = 11;

type Camera = { latitude: number; longitude: number; zoom: number };

export default function BoardSearchScreen() {
  const { systemColors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation('boards');
  const { showToast } = useToast();
  const setActiveBoard = useSetActiveBoard();

  const location = useDeviceLocation();
  const requestLocation = location.request;
  const [query, setQuery] = useState('');
  const [camera, setCamera] = useState<Camera>({ ...DEFAULT_CENTER, zoom: DEFAULT_ZOOM });
  const [selectedUuid, setSelectedUuid] = useState<string | null>(null);
  // Camera updates we push programmatically (recenter / locate) — fed to the
  // map's cameraPosition without echoing back through onCameraMove.
  const [cameraTarget, setCameraTarget] = useState<Camera>({ ...DEFAULT_CENTER, zoom: DEFAULT_ZOOM });
  // Until the user's location resolves OR they pan the map, the camera is just
  // the neutral default (20,0) — searching by those coordinates would fire a
  // wrong query near the equator (web flags the same as a footgun). Gate the
  // location-based search on a real viewport; text search works regardless.
  const [hasRealViewport, setHasRealViewport] = useState(false);

  // Ask for location on mount; center on the user once we have a fix.
  useEffect(() => {
    void requestLocation();
  }, [requestLocation]);
  useEffect(() => {
    if (location.coords) {
      const next = { ...location.coords, zoom: NEARBY_ZOOM };
      setCamera(next);
      setCameraTarget(next);
      setHasRealViewport(true);
    }
  }, [location.coords]);

  const { boards } = useSearchBoardsMap({
    query,
    latitude: hasRealViewport ? camera.latitude : null,
    longitude: hasRealViewport ? camera.longitude : null,
    zoom: camera.zoom,
    enabled: true,
  });

  // Only boards with real coordinates get a pin.
  const pinned = useMemo(() => boards.filter((b) => b.latitude != null && b.longitude != null), [boards]);

  const items = useMemo(
    () =>
      boards
        .map((b) => userBoardToItem(b))
        .filter((item): item is DiscoveryBoardItem => item !== null)
        .map((item) => ({ ...item, isActive: item.key === selectedUuid })),
    [boards, selectedUuid],
  );

  const activateBoard = useCallback(
    async (board: UserBoard) => {
      hapticSelection();
      try {
        await setActiveBoard(board);
        router.navigate('/(tabs)/climbs');
      } catch {
        showToast(t('mobile.boardSwitchError'), 'error');
      }
    },
    [setActiveBoard, router, showToast, t],
  );

  const onSelectItem = useCallback(
    (item: DiscoveryBoardItem) => {
      const board = boards.find((b) => b.uuid === item.key);
      if (board) void activateBoard(board);
    },
    [boards, activateBoard],
  );

  // Tapping a pin selects its board and centers the map on it.
  const onMarkerClick = useCallback(
    (uuid: string) => {
      const board = boards.find((b) => b.uuid === uuid);
      if (!board || board.latitude == null || board.longitude == null) return;
      setSelectedUuid(uuid);
      setCameraTarget({ latitude: board.latitude, longitude: board.longitude, zoom: Math.max(camera.zoom, NEARBY_ZOOM) });
    },
    [boards, camera.zoom],
  );

  // Memoised so the native MapView doesn't re-bind the handler every render.
  // A user-driven move means the viewport is real — start searching by it.
  const onCameraMove = useCallback((event: { coordinates: { latitude?: number; longitude?: number }; zoom: number }) => {
    const { latitude, longitude } = event.coordinates;
    if (latitude == null || longitude == null) return;
    setCamera({ latitude, longitude, zoom: event.zoom });
    setHasRealViewport(true);
  }, []);

  const searchField = (
    <View style={[styles.searchField, { backgroundColor: systemColors.secondaryBackground, top: insets.top + spacing[2] }]}>
      <Icon name="search" size={18} color={systemColors.secondaryLabel} />
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder={t('mobile.search.placeholder')}
        placeholderTextColor={systemColors.tertiaryLabel}
        style={[styles.searchInput, { color: systemColors.label }]}
        autoCorrect={false}
        returnKeyType="search"
      />
      <Pressable onPress={() => router.back()} hitSlop={8}>
        <Icon name="close" size={20} color={systemColors.secondaryLabel} />
      </Pressable>
    </View>
  );

  const resultStrip =
    items.length > 0 ? (
      <View style={[styles.resultStrip, { paddingBottom: insets.bottom + spacing[3] }]}>
        <BoardCarousel items={items} onSelect={onSelectItem} />
      </View>
    ) : null;

  // expo-maps unavailable (pre-build client): show a placeholder but keep the
  // search field + results list working so the feature degrades, not crashes.
  if (!expoMaps) {
    return (
      <View style={[styles.flex, { backgroundColor: systemColors.background }]}>
        {searchField}
        <View style={styles.mapUnavailable}>
          <Icon name="location" size={40} color={systemColors.tertiaryLabel} />
          <Text variant="subheadline" color={systemColors.secondaryLabel} style={styles.mapUnavailableText}>
            {t('mobile.search.mapUnavailable')}
          </Text>
        </View>
        {resultStrip}
      </View>
    );
  }

  const cameraPosition = {
    coordinates: { latitude: cameraTarget.latitude, longitude: cameraTarget.longitude },
    zoom: cameraTarget.zoom,
  };

  // iOS → Apple Maps (no API key); Android → Google Maps (env-supplied key).
  const isApple = Platform.OS === 'ios';
  const MapView = isApple ? expoMaps.AppleMaps.View : expoMaps.GoogleMaps.View;

  // Apple markers take an SF Symbol + tint (so the selected pin recolours);
  // Google markers only share id/coordinates/title — pass just those there.
  const markers = pinned.map((board) => {
    const base = {
      id: board.uuid,
      coordinates: { latitude: board.latitude as number, longitude: board.longitude as number },
      title: board.name,
    };
    return isApple
      ? {
          ...base,
          systemImage: 'mappin.circle.fill',
          tintColor: board.uuid === selectedUuid ? brandColors.primary : brandColors.success,
        }
      : base;
  });

  return (
    <View style={styles.flex}>
      <MapView
        style={styles.flex}
        cameraPosition={cameraPosition}
        markers={markers}
        onCameraMove={onCameraMove}
        onMarkerClick={(marker: { id?: string }) => marker.id && onMarkerClick(marker.id)}
      />
      {searchField}
      {resultStrip}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  searchField: {
    position: 'absolute',
    left: spacing[4],
    right: spacing[4],
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[3],
    height: 44,
    borderRadius: borderRadius.lg,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 6 },
      android: { elevation: 4 },
    }),
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
  },
  resultStrip: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  mapUnavailable: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[3],
    paddingHorizontal: spacing[6],
  },
  mapUnavailableText: {
    textAlign: 'center',
  },
});
