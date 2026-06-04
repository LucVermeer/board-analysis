// Top chrome for the bottom-bar search experiment: the active board's identity in
// a centered glass capsule, flanked by a create-climb glass FAB on the left and a
// board-connect (lightbulb) glass FAB on the right. No search up here — search
// lives in the bottom-right SearchFab in this layout. Pinned below the status bar;
// `box-none` so the list scrolls under it and only the controls capture touches.
// Reports its height so the screen can pad the list below it.

import { useMemo, useCallback } from 'react';
import { type LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { formatBoardDisplayName } from '@boardsesh/board-config';
import { useTheme } from '../../providers/theme-provider';
import { useActiveBoard } from '../../lib/graphql/use-active-board';
import { useOptionalBluetoothContext } from '../../providers/bluetooth-provider';
import { spacing, shadows } from '../../theme/tokens';
import { withAlpha } from '../../theme/colors';
import { hapticLight } from '../../lib/haptics';
import { GlassSurface } from '../GlassSurface';
import { GlassIconButton } from '../GlassIconButton';
import { PressableSurface } from '../PressableSurface';
import { Text } from '../Text';
import { Icon } from '../Icon';

type ClimbTopChromeProps = {
  canCreate: boolean;
  onCreate: () => void;
  onOpenBoardDetail: () => void;
  onHeightChange: (height: number) => void;
};

export function ClimbTopChrome({ canCreate, onCreate, onOpenBoardDetail, onHeightChange }: ClimbTopChromeProps) {
  const { t } = useTranslation('climbs');
  const { t: tSettings } = useTranslation('settings');
  const { t: tCommon } = useTranslation('common');
  const { systemColors, brandColors } = useTheme();
  const insets = useSafeAreaInsets();
  const { data: activeBoard } = useActiveBoard();
  const bluetooth = useOptionalBluetoothContext();
  const bluetoothConnected = bluetooth?.isConnected ?? false;

  const boardLabel = useMemo(() => {
    if (!activeBoard) return null;
    const angle = activeBoard.angle != null ? `${activeBoard.angle}°` : null;
    // A named board (the climber gave it a custom name) leads with that name;
    // otherwise fall back to the board type + size composite.
    const isNamed = activeBoard.name != null && activeBoard.name.trim().length > 0;
    const parts = isNamed
      ? [activeBoard.name, angle]
      : [formatBoardDisplayName(activeBoard.boardType), activeBoard.sizeName ?? activeBoard.layoutName ?? null, angle];
    return parts.filter(Boolean).join(' • ');
  }, [activeBoard]);

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => onHeightChange(event.nativeEvent.layout.height),
    [onHeightChange],
  );

  const handleBoardPress = useCallback(() => {
    hapticLight();
    onOpenBoardDetail();
  }, [onOpenBoardDetail]);

  const handleBluetoothPress = useCallback(() => {
    if (!bluetooth) return;
    hapticLight();
    if (bluetooth.isConnected) void bluetooth.disconnect();
    else void bluetooth.connect();
  }, [bluetooth]);

  return (
    <View pointerEvents="box-none" style={[styles.container, { paddingTop: insets.top }]} onLayout={handleLayout}>
      <View pointerEvents="box-none" style={styles.row}>
        {/* Create-climb FAB (left). The empty 44pt slot when !canCreate still
            balances the right FAB so the capsule stays screen-centered. */}
        <View pointerEvents="box-none" style={styles.sideSlot}>
          {canCreate ? (
            <GlassIconButton
              iconName="plus"
              iconColor={systemColors.label as string}
              onPress={onCreate}
              accessibilityLabel={t('mobile.create.fab.ariaLabel')}
              fallbackColor={systemColors.fill}
            />
          ) : null}
        </View>

        <View pointerEvents="box-none" style={styles.centerSlot}>
          {boardLabel ? (
            <PressableSurface
              onPress={handleBoardPress}
              feedback="scale"
              scaleTo={0.96}
              accessibilityRole="button"
              accessibilityLabel={boardLabel}
              style={styles.capsulePress}
            >
              <View style={styles.capsuleGlass}>
                <GlassSurface
                  glassEffectStyle="clear"
                  fallbackColor={systemColors.elevatedSurface}
                  borderRadius={22}
                  style={StyleSheet.absoluteFill}
                  pointerEvents="none"
                />
                <Icon name="boards" size={14} color={systemColors.secondaryLabel as string} />
                <Text variant="footnote" numberOfLines={1} ellipsizeMode="tail" style={styles.capsuleText}>
                  {boardLabel}
                </Text>
              </View>
            </PressableSurface>
          ) : null}
        </View>

        {/* Board-connect (lightbulb) FAB (right) — warm glass when connected. */}
        <View pointerEvents="box-none" style={styles.sideSlot}>
          {bluetooth ? (
            <GlassIconButton
              iconName={bluetoothConnected ? 'lightbulb.fill' : 'lightbulb'}
              iconColor={bluetoothConnected ? brandColors.warning : (systemColors.label as string)}
              onPress={handleBluetoothPress}
              accessibilityLabel={
                bluetoothConnected ? tCommon('lightControl.disconnect') : tSettings('ble.connectBoard')
              }
              tintColor={bluetoothConnected ? withAlpha(brandColors.warning, 0.2) : undefined}
              fallbackColor={bluetoothConnected ? withAlpha(brandColors.warning, 0.16) : systemColors.fill}
            />
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    minHeight: 44,
  },
  sideSlot: {
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerSlot: {
    flex: 1,
    alignItems: 'center',
  },
  capsulePress: {
    height: 44,
    maxWidth: 180,
    alignItems: 'center',
    justifyContent: 'center',
  },
  capsuleGlass: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    borderRadius: 22,
    paddingHorizontal: 14,
    gap: 6,
    ...shadows.sm,
  },
  capsuleText: {
    fontWeight: '600',
    flexShrink: 1,
  },
});
