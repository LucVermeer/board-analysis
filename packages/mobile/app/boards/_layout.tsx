import { Stack, router } from 'expo-router';
import { Platform, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../src/components/Icon';

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
      <Stack.Screen
        name="index"
        options={{
          title: t('mobile.nav.boards'),
          // A modal now, not a tab: give it an explicit close button (iOS
          // swipe-to-dismiss alone isn't discoverable for a primary entry point).
          headerLeft: ({ tintColor }) => (
            <Pressable
              onPress={() => router.back()}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('ariaLabels.close')}
            >
              <Icon name="close" size={22} color={tintColor} />
            </Pressable>
          ),
        }}
      />
      {/* Full-screen map; it has its own overlay search field, no nav header. */}
      <Stack.Screen name="search" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
    </Stack>
  );
}
