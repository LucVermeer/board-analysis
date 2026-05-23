import { Stack } from 'expo-router';

export default function BoardsLayout() {
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
      <Stack.Screen name="index" options={{ title: 'Boards' }} />
    </Stack>
  );
}
