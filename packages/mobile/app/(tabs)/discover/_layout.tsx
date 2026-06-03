import { Stack } from 'expo-router';
import { Platform } from 'react-native';
import { useTranslation } from 'react-i18next';

export default function DiscoverLayout() {
  const { t } = useTranslation('playlists');

  return (
    <Stack
      screenOptions={{
        headerLargeTitle: false,
        // Solid header on Android (transparent blur is iOS-only; on Android it
        // leaves content under the floating header + status bar). See climbs/_layout.
        headerTransparent: Platform.OS === 'ios',
        headerBlurEffect: 'systemMaterial',
        contentStyle: { backgroundColor: 'transparent' },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: t('bottomTabBar.discover'),
        }}
      />
      <Stack.Screen
        name="[playlist_uuid]"
        options={{
          title: t('metadata.detail.fallbackTitle'),
        }}
      />
      <Stack.Screen
        name="smart/[type]"
        options={{
          title: t('bottomTabBar.discover'),
        }}
      />
    </Stack>
  );
}
