import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { QueryProvider } from '../src/providers/query-provider';
import { ThemeProvider } from '../src/providers/theme-provider';
import { AuthProvider } from '../src/providers/auth-provider';
import { I18nProvider } from '../src/providers/i18n-provider';
import { BluetoothProvider } from '../src/providers/bluetooth-provider';
import { useDefaultBoard } from '../src/lib/graphql/hooks';

const styles = StyleSheet.create({
  root: { flex: 1 },
});

function BluetoothProviderWrapper({ children }: { children: ReactNode }) {
  const { data: defaultBoard } = useDefaultBoard();

  if (!defaultBoard) {
    // No board selected yet — BLE only makes sense with a board
    return <>{children}</>;
  }

  return (
    <BluetoothProvider
      boardName={defaultBoard.boardType}
      layoutId={defaultBoard.layoutId}
      sizeId={defaultBoard.sizeId}
      setIds={defaultBoard.setIds}
    >
      {children}
    </BluetoothProvider>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <StatusBar style="auto" />
      <I18nProvider>
        <QueryProvider>
          <ThemeProvider>
            <AuthProvider>
              <BottomSheetModalProvider>
                <BluetoothProviderWrapper>
                  <Stack screenOptions={{ headerShown: false }} initialRouteName="(tabs)">
                    <Stack.Screen name="(tabs)" />
                    <Stack.Screen name="auth" options={{ headerShown: false, gestureEnabled: false }} />
                  </Stack>
                </BluetoothProviderWrapper>
              </BottomSheetModalProvider>
            </AuthProvider>
          </ThemeProvider>
        </QueryProvider>
      </I18nProvider>
    </GestureHandlerRootView>
  );
}
