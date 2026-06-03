import { Stack } from 'expo-router';
import { Platform } from 'react-native';
import { useTranslation } from 'react-i18next';

export default function ProfileLayout() {
  const { t } = useTranslation('common');

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
      <Stack.Screen name="index" options={{ title: t('mobile.nav.profile') }} />
      <Stack.Screen name="more" options={{ title: t('mobile.more.title') }} />
      {/* i18n-ignore-next-line — preview-only screen */}
      <Stack.Screen name="branch-switcher" options={{ title: 'Branch Switcher' }} />
      <Stack.Screen name="dev-servers" options={{ title: t('mobile.more.metroServersTitle') }} />
    </Stack>
  );
}
