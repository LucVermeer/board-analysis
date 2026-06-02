import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import BlurTabBar from '../../src/components/BlurTabBar';
import { useActiveBoard } from '../../src/lib/graphql/use-active-board';

export default function TabLayout() {
  const { t } = useTranslation('common');

  const { data: activeBoard, isLoading } = useActiveBoard();
  // initialRouteName is consumed only on first mount; committing <Tabs> before
  // the AsyncStorage read settles would lock in the wrong tab for new users.
  if (isLoading) return null;
  const initialRouteName = !activeBoard ? 'boards' : 'climbs';

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
        name="record"
        options={{
          title: t('mobile.session.recordTab'),
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
