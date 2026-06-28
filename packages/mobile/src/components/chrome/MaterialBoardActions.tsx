// The Material variant's board-context app-bar actions: an angle control and a
// bluetooth lightbulb, both as M3 `Appbar.Action`s. Extracted from
// `ClimbTopChrome` so the Climbs app bar and the shared `CollapsingTopChrome`
// material branch (Discover) render the same controls instead of duplicating
// them. They are the flat M3 counterparts of the liquid-glass `AngleToolbarAction`
// / `LightbulbToolbarAction` islands — each reads its own state and renders
// nothing when it doesn't apply (no adjustable board / no bluetooth).

import { useCallback, useState } from 'react';
import { StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Appbar, Chip } from 'react-native-paper';
import { useTheme } from '../../providers/theme-provider';
import { useActiveBoard, useSetActiveBoard } from '../../lib/graphql/use-active-board';
import { hapticLight } from '../../lib/haptics';
import { useLightbulbControl } from '../ble/use-lightbulb-control';
import { useBleControlSheet } from '../../providers/ble-control-sheet-provider';
import { Text } from '../Text';
import { iconMap } from '../icon-map';
import { AngleSelectorSheet } from '../play-drawer/AngleSelectorSheet';

/**
 * Shared angle state for the Material angle controls: reads the active board, owns
 * the selector sheet's open state, and writes the chosen angle back (re-grading the
 * list).
 *
 * Each consumer gets its OWN instance (and its own `visible` state) — that's by
 * design, not a bug: `MaterialAngleAction` (Discover's app bar) and
 * `MaterialAngleChip` (the Climbs quick row) never co-render on the same screen
 * (Climbs dropped the app-bar action when the angle moved to the chip row), so
 * there is no shared sheet-open state to diverge.
 */
function useMaterialAngleControl() {
  const { data: activeBoard } = useActiveBoard();
  const setActiveBoard = useSetActiveBoard();
  const [visible, setVisible] = useState(false);

  const canAdjust = activeBoard?.isAngleAdjustable !== false && activeBoard?.angle != null;
  const open = useCallback(() => {
    if (!activeBoard || activeBoard.isAngleAdjustable === false || activeBoard.angle == null) return;
    hapticLight();
    setVisible(true);
  }, [activeBoard]);
  const close = useCallback(() => setVisible(false), []);
  const change = useCallback(
    (newAngle: number) => {
      if (!activeBoard || activeBoard.isAngleAdjustable === false || newAngle === activeBoard.angle) return;
      void setActiveBoard({ ...activeBoard, angle: newAngle });
    },
    [activeBoard, setActiveBoard],
  );

  return { activeBoard, canAdjust, visible, open, close, change };
}

export function MaterialAngleAction() {
  const { systemColors } = useTheme();
  const { t: tSession } = useTranslation('session');
  const { activeBoard, canAdjust, visible, open, close, change } = useMaterialAngleControl();

  const angleIcon = useCallback(
    () => (
      <Text variant="caption1" style={[styles.materialAngleText, { color: systemColors.label }]}>
        {activeBoard?.angle}°
      </Text>
    ),
    [activeBoard?.angle, systemColors.label],
  );

  if (!activeBoard || !canAdjust) return null;

  return (
    <>
      <Appbar.Action icon={angleIcon} onPress={open} accessibilityLabel={tSession('mobile.angleSelector.title')} />
      <AngleSelectorSheet
        visible={visible}
        onClose={close}
        boardName={activeBoard.boardType}
        layoutId={activeBoard.layoutId}
        currentAngle={activeBoard.angle}
        onAngleChange={change}
      />
    </>
  );
}

/**
 * The Material angle control as an M3 quick-row chip (Climbs). Angle re-grades the
 * whole list, so it belongs with the other list parameters (grade / filters) one
 * tap away, not buried — and it keeps the over-budget app bar lean. Renders nothing
 * for fixed-angle boards (or none).
 */
export function MaterialAngleChip() {
  const { t: tSession } = useTranslation('session');
  const { activeBoard, canAdjust, visible, open, close, change } = useMaterialAngleControl();

  if (!activeBoard || !canAdjust) return null;

  return (
    <>
      <Chip
        compact
        mode="outlined"
        onPress={open}
        accessibilityLabel={tSession('mobile.angleSelector.title')}
        textStyle={styles.materialChipText}
      >
        {`${activeBoard.angle}°`}
      </Chip>
      <AngleSelectorSheet
        visible={visible}
        onClose={close}
        boardName={activeBoard.boardType}
        layoutId={activeBoard.layoutId}
        currentAngle={activeBoard.angle}
        onAngleChange={change}
      />
    </>
  );
}

export function MaterialLightbulbAction() {
  const { systemColors, brandColors } = useTheme();
  const { t: tCommon } = useTranslation('common');
  const { t: tSettings } = useTranslation('settings');
  const { open: openControls } = useBleControlSheet();
  const { bluetooth, lit, localConnected, onPress, onLongPress } = useLightbulbControl({
    source: 'lightbulb_toolbar',
    onOpenControls: openControls,
  });

  const handlePress = useCallback(() => {
    hapticLight();
    onPress();
  }, [onPress]);

  if (!bluetooth) return null;

  const iconName = lit ? iconMap['lightbulb.fill'].android : iconMap.lightbulb.android;
  const iconColor = lit ? brandColors.warning : systemColors.label;

  return (
    <Appbar.Action
      icon={iconName}
      color={iconColor as string}
      onPress={handlePress}
      // Short press connects/disconnects; long press (connected) opens the
      // controls sheet — same as the drawer + accessory-bar lightbulbs.
      onLongPress={localConnected ? onLongPress : undefined}
      // The label reflects what tapping does (this device's link), not the fill —
      // the bulb can read lit because a session peer holds the wall.
      accessibilityLabel={localConnected ? tCommon('lightControl.disconnect') : tSettings('ble.connectBoard')}
    />
  );
}

const styles = StyleSheet.create({
  materialAngleText: {
    fontWeight: '700',
    textAlign: 'center',
  },
  materialChipText: {
    fontWeight: '700',
  },
});
