import { Tabs } from 'expo-router';
import BlurTabBar from '../../src/components/BlurTabBar';

export default function TabLayout() {
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
          title: 'Boards',
        }}
      />
      <Tabs.Screen
        name="climbs"
        options={{
          title: 'Climbs',
        }}
      />
      <Tabs.Screen
        name="queue"
        options={{
          title: 'Queue',
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
        }}
      />
    </Tabs>
  );
}
