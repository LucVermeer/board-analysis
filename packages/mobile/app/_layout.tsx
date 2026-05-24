import { StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { QueryProvider } from '../src/providers/query-provider';
import { ThemeProvider } from '../src/providers/theme-provider';
import { AuthProvider } from '../src/providers/auth-provider';
import { I18nProvider } from '../src/providers/i18n-provider';

const styles = StyleSheet.create({
  root: { flex: 1 },
});

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <StatusBar style="auto" />
      <I18nProvider>
        <QueryProvider>
          <ThemeProvider>
            <AuthProvider>
              <BottomSheetModalProvider>
                <Stack screenOptions={{ headerShown: false }} initialRouteName="(tabs)">
                  <Stack.Screen name="(tabs)" />
                  <Stack.Screen name="auth" options={{ headerShown: false, gestureEnabled: false }} />
                </Stack>
              </BottomSheetModalProvider>
            </AuthProvider>
          </ThemeProvider>
        </QueryProvider>
      </I18nProvider>
    </GestureHandlerRootView>
  );
}
