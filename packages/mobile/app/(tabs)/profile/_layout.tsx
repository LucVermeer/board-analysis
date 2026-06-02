import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

export default function ProfileLayout() {
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
      <Stack.Screen name="index" options={{ title: t('mobile.nav.profile') }} />
      <Stack.Screen name="more" options={{ title: t('mobile.more.title') }} />
      {/* i18n-ignore-next-line — preview-only screen */}
      <Stack.Screen name="branch-switcher" options={{ title: 'Branch Switcher' }} />
      <Stack.Screen name="dev-servers" options={{ title: t('mobile.more.metroServersTitle') }} />
    </Stack>
  );
}
