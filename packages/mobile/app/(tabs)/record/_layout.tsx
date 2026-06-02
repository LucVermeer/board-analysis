import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

/**
 * The Record tab itself doesn't show a screen — tapping it is intercepted by
 * `<BlurTabBar>` to open the full-screen session overlay. The Stack exists so
 * that `/record/summary` (which fires after `endSession()`) has a presentation
 * surface, and so future deep links / nested routes have a place to land.
 */
export default function RecordLayout() {
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
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen
        name="summary"
        options={{
          title: t('summary.dialogTitle'),
          presentation: 'modal',
        }}
      />
    </Stack>
  );
}
