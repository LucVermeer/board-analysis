import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

export default function ClimbsLayout() {
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
      <Stack.Screen
        name="index"
        options={{
          title: t('mobile.nav.climbs'),
        }}
      />
      <Stack.Screen
        name="[climbUuid]"
        options={{
          title: t('mobile.nav.climb'),
        }}
      />
      <Stack.Screen
        name="setters"
        options={{
          title: t('mobile.nav.setters'),
          presentation: 'modal',
        }}
      />
      <Stack.Screen
        name="create"
        options={{
          title: t('mobile.nav.createClimb'),
          presentation: 'modal',
        }}
      />
    </Stack>
  );
}
