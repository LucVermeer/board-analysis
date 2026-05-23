import { Stack } from 'expo-router';

export default function ClimbsLayout() {
  return (
    <Stack
      screenOptions={{
        headerLargeTitle: true,
        headerLargeTitleShadowVisible: false,
        headerTransparent: true,
        headerBlurEffect: 'systemMaterial',
        contentStyle: { backgroundColor: 'transparent' },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: 'Climbs',
          headerSearchBarOptions: {
            placeholder: 'Search climbs...',
            autoCapitalize: 'none',
            hideWhenScrolling: false,
          },
        }}
      />
      <Stack.Screen
        name="[climbUuid]"
        options={{
          title: 'Climb',
          headerLargeTitle: false,
        }}
      />
    </Stack>
  );
}
