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
import { spacing, shadows, glassMaterial } from '../../theme/tokens';
import { withAlpha } from '../../theme/colors';
import { glassSize } from '../../theme/layout';
import { hapticLight } from '../../lib/haptics';
import { useNativeGlass } from '../../hooks/use-native-glass';
import { GlassSurface } from '../GlassSurface';
import { GlassIconButton } from '../GlassIconButton';
import { PressableSurface } from '../PressableSurface';
import { Text } from '../Text';
import { Icon } from '../Icon';

const CAPSULE_RADIUS = glassSize.capsule / 2;

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
  const nativeGlass = useNativeGlass();
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
              size={glassSize.standard}
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
              <View
                style={[
                  styles.capsuleGlass,
                  // Native Liquid Glass renders its own edge + lift; keep the
                  // hairline border + shadow only on the blur/solid fallback.
                  !nativeGlass && shadows.sm,
                  !nativeGlass && { borderWidth: StyleSheet.hairlineWidth, borderColor: systemColors.separator },
                ]}
              >
                <GlassSurface
                  glassEffectStyle="regular"
                  fallbackColor={systemColors.elevatedSurface}
                  borderRadius={CAPSULE_RADIUS}
                  blurAmount={glassMaterial.thin}
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
              size={glassSize.standard}
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
    minHeight: glassSize.standard,
  },
  sideSlot: {
    width: glassSize.standard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerSlot: {
    flex: 1,
    alignItems: 'center',
  },
  capsulePress: {
    height: glassSize.capsule,
    maxWidth: 180,
    alignItems: 'center',
    justifyContent: 'center',
  },
  capsuleGlass: {
    flexDirection: 'row',
    alignItems: 'center',
    height: glassSize.capsule,
    borderRadius: CAPSULE_RADIUS,
    paddingHorizontal: 14,
    gap: 6,
  },
  capsuleText: {
    fontWeight: '600',
    flexShrink: 1,
  },
});
