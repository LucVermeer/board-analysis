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
          // The library owns its own floating glass chrome + in-body large title,
          // so it hides the native header (which otherwise occluded the controls).
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="all"
        options={{
          // "My Playlists" — a plain vertical list. A solid native header gives it
          // a title + automatic back button and avoids the transparent-blur top
          // inset the index screen manages with its floating chrome.
          headerShown: true,
          headerTransparent: false,
          title: t('library.allPlaylists.title'),
        }}
      />
      <Stack.Screen
        name="[playlist_uuid]"
        options={{
          // The detail view owns its full-bleed gradient hero with a floating
          // back FAB + action FABs, so it hides the native header bar.
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="smart/[type]"
        options={{
          headerShown: false,
        }}
      />
    </Stack>
  );
}
