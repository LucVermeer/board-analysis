import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

export default function DiscoverLayout() {
  const { t } = useTranslation('playlists');

  return (
    <Stack
      screenOptions={{
        headerLargeTitle: false,
        headerTransparent: true,
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
