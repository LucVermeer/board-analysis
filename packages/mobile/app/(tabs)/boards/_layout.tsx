import { Stack } from 'expo-router';
import { Platform } from 'react-native';
import { useTranslation } from 'react-i18next';

export default function BoardsLayout() {
  const { t } = useTranslation('common');

  return (
    <Stack
      screenOptions={{
        headerLargeTitle: false,
        // iOS keeps the transparent blur header (content insets via
        // contentInsetAdjustmentBehavior="automatic"). On Android that prop is a
        // no-op and edge-to-edge would draw content under the floating header +
        // status bar (the title overlapped the toolbar) — a solid header lays the
        // scene out below it.
        headerTransparent: Platform.OS === 'ios',
        headerBlurEffect: 'systemMaterial',
        contentStyle: { backgroundColor: 'transparent' },
      }}
    >
      <Stack.Screen name="index" options={{ title: t('mobile.nav.boards') }} />
      {/* Full-screen map; it has its own overlay search field, no nav header. */}
      <Stack.Screen name="search" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
    </Stack>
  );
}
