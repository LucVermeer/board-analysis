import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import BlurTabBar from '../../src/components/BlurTabBar';
import { useActiveBoard } from '../../src/lib/graphql/use-active-board';

export default function TabLayout() {
  const { t } = useTranslation('common');

  // Land on the board picker when the user has no active board yet (instead of
  // an empty climbs tab); otherwise open straight to climbs. `initialRouteName`
  // is read once on mount — the active board resolves from AsyncStorage well
  // before first paint, and the tab bar stays fully navigable either way.
  const { data: activeBoard, isLoading } = useActiveBoard();
  const initialRouteName = !isLoading && !activeBoard ? 'boards' : 'climbs';

  return (
    <Tabs
      initialRouteName={initialRouteName}
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
