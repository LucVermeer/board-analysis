import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

export default function MoreLayout() {
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
      <Stack.Screen name="index" options={{ title: t('mobile.more.title') }} />
      {/* i18n-ignore-next-line — preview-only screen */}
      <Stack.Screen name="branch-switcher" options={{ title: 'Branch Switcher' }} />
      {/* i18n-ignore-next-line — dev-only screen */}
      <Stack.Screen name="dev-server-switcher" options={{ title: 'Metro Bundler' }} />
    </Stack>
  );
}
