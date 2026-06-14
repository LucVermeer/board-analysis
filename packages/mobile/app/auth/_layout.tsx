import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      {/* register.tsx sets its own header (title + back chevron) via Stack.Screen. */}
      <Stack.Screen name="register" />
    </Stack>
  );
}
