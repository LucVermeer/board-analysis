import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import BlurTabBar from '../../src/components/BlurTabBar';

export default function TabLayout() {
  const { t } = useTranslation('common');

  return (
    <Tabs
      tabBar={(props) => <BlurTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarStyle: { position: 'absolute' },
      }}
    >
      <Tabs.Screen
        name="boards"
        options={{
          title: t('mobile.nav.boards'),
        }}
      />
      <Tabs.Screen
        name="climbs"
        options={{
          title: t('mobile.nav.climbs'),
        }}
      />
      <Tabs.Screen
        name="queue"
        options={{
          title: t('mobile.nav.queue'),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('mobile.nav.profile'),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: t('mobile.more.title'),
        }}
      />
    </Tabs>
  );
}
