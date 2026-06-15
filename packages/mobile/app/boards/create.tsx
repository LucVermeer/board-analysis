import { useCallback, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type BottomSheet from '@gorhom/bottom-sheet';
import type { UserBoard } from '@boardsesh/shared-schema';
import type { RecentBoardSerial } from '@boardsesh/graphql/operations';
import { useMyBoards, useMyRecentBoardSerials } from '../../src/lib/graphql/hooks';
import { useSetActiveBoard } from '../../src/lib/graphql/use-active-board';
import { useAuth } from '../../src/providers/auth-provider';
import { useToast } from '../../src/providers/toast-provider';
import { hapticSelection } from '../../src/lib/haptics';
import { resolveBoardReturnTo } from '../../src/lib/boards/board-return-to';
import { useBottomChromeMetrics } from '../../src/hooks/use-bottom-chrome-metrics';
import { Text } from '../../src/components/Text';
import { Icon } from '../../src/components/Icon';
import { Button } from '../../src/components/Button';
import { ActivityIndicator } from '../../src/components/ActivityIndicator';
import { RecentSerialRow } from '../../src/components/board-discovery/RecentSerialRow';
import { CustomBoardSheet } from '../../src/components/board-discovery/CustomBoardSheet';
import { BluetoothQuickstartSheet } from '../../src/components/board-discovery/BluetoothQuickstartSheet';
import { iosSystemColors } from '../../src/theme/ios-colors';
import { spacing } from '../../src/theme/tokens';

export default function CreateBoard() {
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const boardReturnTo = resolveBoardReturnTo(returnTo);
  const { isAuthenticated } = useAuth();
  const { t } = useTranslation('boards');
  const { showToast } = useToast();
  const bottomChrome = useBottomChromeMetrics();

  const setActiveBoard = useSetActiveBoard();
  const { data: recents, isLoading } = useMyRecentBoardSerials(10, { enabled: isAuthenticated });
  const { data: boardConnection } = useMyBoards(undefined, { enabled: isAuthenticated });
  const myBoards = boardConnection?.boards ?? [];

  const customSheetRef = useRef<BottomSheet>(null);
  const bluetoothSheetRef = useRef<BottomSheet>(null);
  const [bluetoothActive, setBluetoothActive] = useState(false);

  const activateBoard = useCallback(
    async (board: UserBoard) => {
      hapticSelection();
      try {
        await setActiveBoard(board);
        router.dismissTo(boardReturnTo);
      } catch {
        showToast(t('mobile.boardSwitchError'), 'error');
      }
    },
    [setActiveBoard, router, boardReturnTo, showToast, t],
  );

  // Tapping a recent serial opens the naming/confirm step: create mode when the
  // serial has no owned board yet, rename when it already maps to one.
  const onSelectRecent = useCallback(
    (serial: RecentBoardSerial) => {
      router.push({
        pathname: '/boards/name',
        params: {
          serialNumber: serial.serialNumber,
          mode: serial.ownedBoard ? 'rename' : 'create',
          returnTo: boardReturnTo,
        },
      });
    },
    [router, boardReturnTo],
  );

  const openManualBuilder = useCallback(() => {
    customSheetRef.current?.expand();
  }, []);

  const openBluetoothScan = useCallback(() => {
    setBluetoothActive(true);
    bluetoothSheetRef.current?.expand();
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: RecentBoardSerial }) => <RecentSerialRow serial={item} onPress={onSelectRecent} />,
    [onSelectRecent],
  );

  const hasRecents = (recents?.length ?? 0) > 0;

  return (
    <>
      <FlashList
        contentInsetAdjustmentBehavior="automatic"
        data={recents ?? []}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={{ paddingBottom: bottomChrome.scrollBottomPadding }}
        ListHeaderComponent={
          hasRecents ? (
            <View style={styles.header}>
              <Text variant="subheadline" color={iosSystemColors.systemGray}>
                {t('mobile.create.subtitle')}
              </Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" />
            </View>
          ) : (
            <View style={styles.centered}>
              <Icon name="bluetooth" size={40} color={iosSystemColors.systemGray} />
              <Text variant="headline" style={styles.emptyTitle}>
                {t('mobile.create.emptyTitle')}
              </Text>
              <Text variant="subheadline" color={iosSystemColors.systemGray} style={styles.emptyBody}>
                {t('mobile.create.emptyBody')}
              </Text>
              <Button title={t('mobile.create.scanCta')} onPress={openBluetoothScan} style={styles.emptyPrimary} />
              <Button
                title={t('mobile.create.manualCta')}
                variant="text"
                onPress={openManualBuilder}
                style={styles.emptySecondary}
              />
            </View>
          )
        }
        ListFooterComponent={
          hasRecents ? (
            <View style={styles.footer}>
              <Button title={t('mobile.create.manualCta')} variant="outlined" onPress={openManualBuilder} />
            </View>
          ) : null
        }
      />

      <CustomBoardSheet
        ref={customSheetRef}
        seed={null}
        existingBoards={myBoards}
        onCreated={(board) => {
          customSheetRef.current?.close();
          void activateBoard(board);
        }}
        onSelectExisting={(board) => {
          customSheetRef.current?.close();
          void activateBoard(board);
        }}
        onError={() => showToast(t('mobile.custom.createError'), 'error')}
      />
      <BluetoothQuickstartSheet
        ref={bluetoothSheetRef}
        active={bluetoothActive}
        onClose={() => setBluetoothActive(false)}
        onSelect={(board) => {
          bluetoothSheetRef.current?.close();
          void activateBoard(board);
        }}
      />
    </>
  );
}

function keyExtractor(item: RecentBoardSerial): string {
  return item.serialNumber;
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    paddingBottom: spacing[2],
  },
  footer: {
    padding: spacing[4],
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[6],
    paddingVertical: spacing[12],
  },
  emptyTitle: {
    marginTop: spacing[3],
    textAlign: 'center',
  },
  emptyBody: {
    marginTop: spacing[1],
    textAlign: 'center',
  },
  emptyPrimary: {
    marginTop: spacing[5],
    alignSelf: 'stretch',
  },
  emptySecondary: {
    marginTop: spacing[2],
  },
});
