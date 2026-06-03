import { Stack } from 'expo-router';
import { Platform } from 'react-native';
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
        // Solid header on Android (transparent blur is iOS-only; on Android it
        // leaves content under the floating header + status bar). See climbs/_layout.
        headerTransparent: Platform.OS === 'ios',
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
