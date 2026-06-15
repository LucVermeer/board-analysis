import { Stack } from 'expo-router';
import { glassStackScreenOptions } from '../../src/theme/navigation';

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ ...glassStackScreenOptions, headerShown: false }}>
      <Stack.Screen name="login" />
      {/* register.tsx sets its own header (title + back chevron) via Stack.Screen. */}
      <Stack.Screen name="register" />
    </Stack>
  );
}
