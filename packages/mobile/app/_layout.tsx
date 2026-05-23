import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { QueryProvider } from '../src/providers/query-provider';
import { ThemeProvider } from '../src/providers/theme-provider';
import { AuthProvider } from '../src/providers/auth-provider';
import { I18nProvider } from '../src/providers/i18n-provider';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <I18nProvider>
        <QueryProvider>
          <ThemeProvider>
            <AuthProvider>
              <BottomSheetModalProvider>
                <Stack screenOptions={{ headerShown: false }}>
                  <Stack.Screen name="(tabs)" />
                  <Stack.Screen name="auth/login" />
                  <Stack.Screen name="auth/callback" />
                </Stack>
              </BottomSheetModalProvider>
            </AuthProvider>
          </ThemeProvider>
        </QueryProvider>
      </I18nProvider>
    </GestureHandlerRootView>
  );
}
