import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

export default function QueueLayout() {
  const { t } = useTranslation('common');

  return (
    <Stack
      screenOptions={{
        headerLargeTitle: true,
        headerLargeTitleShadowVisible: false,
        headerTransparent: true,
        headerBlurEffect: 'systemMaterial',
        contentStyle: { backgroundColor: 'transparent' },
      }}
    >
      <Stack.Screen name="index" options={{ title: t('mobile.nav.queue') }} />
    </Stack>
  );
}
