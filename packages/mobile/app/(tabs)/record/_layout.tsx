import { Stack } from 'expo-router';
import { Platform } from 'react-native';
import { useTranslation } from 'react-i18next';

/**
 * The Record tab renders the session screen inline (its `index` route). The
 * Stack also hosts `/record/summary` (which fires after `endSession()`) as a
 * modal, and gives future deep links / nested routes a place to land.
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
