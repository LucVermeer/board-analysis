import { forwardRef, useEffect } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import type BottomSheet from '@expo/ui/community/bottom-sheet';
import { useTranslation } from 'react-i18next';
import type { UserBoard } from '@boardsesh/shared-schema';
import { useBoardScan } from '../../lib/ble/use-board-scan';
import { useBoardsBySerialNumbers } from '../../lib/graphql/hooks';
import { spacing, borderRadius } from '../../theme/tokens';
import { useTheme } from '../../providers/theme-provider';
import { Sheet } from '../Sheet';
import { Text } from '../Text';
import { Icon } from '../Icon';
import { ActivityIndicator } from '../ActivityIndicator';

type BluetoothQuickstartSheetProps = {
  /** True while the sheet is open — drives when the scan kicks off. */
  active: boolean;
  onClose: () => void;
  onSelect: (board: UserBoard) => void;
};

/**
 * Bluetooth quickstart: scans for in-range Aurora boards (scan-only, no
 * connection), resolves their serials to boards, and lets the user pick one to
 * make active. Mirrors the web home's Bluetooth card flow.
 */
export const BluetoothQuickstartSheet = forwardRef<BottomSheet, BluetoothQuickstartSheetProps>(
  function BluetoothQuickstartSheet({ active, onClose, onSelect }, ref) {
    const { systemColors } = useTheme();
    const { t } = useTranslation('boards');
    const { status, serials, start, reset } = useBoardScan();
    const { data: boards = [], isLoading: isResolving } = useBoardsBySerialNumbers(serials);

    // Start scanning when the sheet opens; reset back to idle when it closes so
    // the next open re-scans from scratch.
    useEffect(() => {
      if (active && status === 'idle') {
        void start();
      } else if (!active && status !== 'idle') {
        reset();
      }
    }, [active, status, start, reset]);

    const renderBody = () => {
      if (status === 'unavailable') {
        return (
          <View style={styles.state}>
            <Icon name="warning" size={40} color={systemColors.tertiaryLabel} />
            <Text variant="subheadline" color={systemColors.secondaryLabel} style={styles.stateText}>
              {t('mobile.bluetooth.unavailable')}
            </Text>
          </View>
        );
      }

      if (boards.length > 0) {
        return (
          <View style={styles.list}>
            {boards.map((board) => (
              <Pressable
                key={board.uuid}
                onPress={() => onSelect(board)}
                style={[styles.row, { borderColor: systemColors.separator }]}
              >
                <Icon name="bluetooth" size={20} color={systemColors.label} />
                <View style={styles.rowText}>
                  <Text variant="headline">{board.name}</Text>
                  <Text variant="subheadline" color={systemColors.secondaryLabel}>
                    {board.boardType} · {board.sizeName ?? ''}
                  </Text>
                </View>
                <Icon name="add" size={20} color={systemColors.tertiaryLabel} />
              </Pressable>
            ))}
          </View>
        );
      }

      if (status === 'done') {
        return (
          <View style={styles.state}>
            <Icon name="search" size={40} color={systemColors.tertiaryLabel} />
            <Text variant="subheadline" color={systemColors.secondaryLabel} style={styles.stateText}>
              {t('mobile.bluetooth.noResults')}
            </Text>
          </View>
        );
      }

      // scanning / resolving
      return (
        <View style={styles.state}>
          <ActivityIndicator size="large" />
          <Text variant="subheadline" color={systemColors.secondaryLabel} style={styles.stateText}>
            {isResolving ? t('mobile.bluetooth.resolving') : t('mobile.bluetooth.scanning')}
          </Text>
        </View>
      );
    };

    return (
      <Sheet ref={ref} snapPoints={['55%']} onClose={onClose}>
        <View style={styles.content}>
          <Text variant="title3" style={styles.heading}>
            {t('mobile.bluetooth.title')}
          </Text>
          {renderBody()}
        </View>
      </Sheet>
    );
  },
);

const styles = StyleSheet.create({
  content: {
    flex: 1,
    padding: spacing[4],
  },
  heading: {
    marginBottom: spacing[4],
  },
  state: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[3],
    paddingVertical: spacing[8],
  },
  stateText: {
    textAlign: 'center',
  },
  list: {
    gap: spacing[2],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    padding: spacing[3],
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  rowText: {
    flex: 1,
  },
});
