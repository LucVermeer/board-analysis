import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

export default function BoardsLayout() {
  const { t } = useTranslation('common');

  return (
    <Stack
      screenOptions={{
        headerLargeTitle: false,
        headerTransparent: true,
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
