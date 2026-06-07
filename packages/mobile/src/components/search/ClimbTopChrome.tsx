// Top chrome for the climbs list. On native-search devices, Expo's stack search
// bar owns text input and this chrome carries board/angle/create/light controls.
// On fallback devices, it also keeps a custom climb-name search row. The bottom
// right filter FAB owns the full filter sheet and long-press grade rail.

import { type RefObject, useCallback, useMemo, useState } from 'react';
import { Keyboard, type LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { formatBoardDisplayName } from '@boardsesh/board-config';
import { useTheme } from '../../providers/theme-provider';
import { useActiveBoard, useSetActiveBoard } from '../../lib/graphql/use-active-board';
import { useOptionalBluetoothContext } from '../../providers/bluetooth-provider';
import { spacing, shadows } from '../../theme/tokens';
import { glassSize } from '../../theme/layout';
import { hapticLight } from '../../lib/haptics';
import { useNativeGlass } from '../../hooks/use-native-glass';
import { GlassSurface } from '../GlassSurface';
import { PressableSurface } from '../PressableSurface';
import { SearchHeader, type SearchHeaderHandle } from '../SearchHeader';
import { Text } from '../Text';
import { Icon } from '../Icon';
import { AngleSelectorSheet } from '../play-drawer/AngleSelectorSheet';
import { FilterButton } from './FilterButton';

const CAPSULE_RADIUS = glassSize.capsule / 2;
const TOP_ACTION_SIZE = glassSize.standard;
const TOP_TOOLBAR_WIDTH = TOP_ACTION_SIZE * 2;
const TOP_TOOLBAR_RADIUS = TOP_ACTION_SIZE / 2;
const SUMMARY_CAPSULE_HEIGHT = glassSize.mini;
const SUMMARY_CAPSULE_RADIUS = SUMMARY_CAPSULE_HEIGHT / 2;

type ClimbTopChromeProps = {
  searchMode?: 'custom' | 'native';
  canCreate: boolean;
  onCreate: () => void;
  onOpenBoardDetail: () => void;
  onHeightChange: (height: number) => void;
  searchFieldRef: RefObject<SearchHeaderHandle | null>;
  searchInitialValue: string;
  searchPlaceholder: string;
  onSearchChange: (text: string) => void;
  onSearchFocus: () => void;
  onSearchBlur: () => void;
  onCloseGrade: () => void;
  /** Active-filter count for the Material variant's filter button (rendered to
   *  the left of the search field — the affordance the native search bar can't
   *  host). Liquid Glass keeps the bottom filter FAB instead. */
  activeFilterCount?: number;
  onOpenFilters?: () => void;
  /** Active-filter summary shown as a single capsule below the board name.
   *  Tapping it clears all filters (no per-chip remove). Absent = no filters. */
  filterSummary?: { text: string; onClear: () => void };
};

export function ClimbTopChrome({
  searchMode = 'custom',
  canCreate,
  onCreate,
  onOpenBoardDetail,
  onHeightChange,
  searchFieldRef,
  searchInitialValue,
  searchPlaceholder,
  onSearchChange,
  onSearchFocus,
  onSearchBlur,
  onCloseGrade,
  activeFilterCount = 0,
  onOpenFilters,
  filterSummary,
}: ClimbTopChromeProps) {
  const { t } = useTranslation('climbs');
  const { t: tSettings } = useTranslation('settings');
  const { t: tCommon } = useTranslation('common');
  const { t: tSession } = useTranslation('session');
  const { systemColors, brandColors, variant } = useTheme();
  const nativeGlass = useNativeGlass();
  const insets = useSafeAreaInsets();
  const { data: activeBoard } = useActiveBoard();
  const setActiveBoard = useSetActiveBoard();
  const bluetooth = useOptionalBluetoothContext();
  const bluetoothConnected = bluetooth?.isConnected ?? false;
  const [angleSelectorVisible, setAngleSelectorVisible] = useState(false);
  const usesCustomSearch = searchMode === 'custom';

  const boardLabel = useMemo(() => {
    if (!activeBoard) return null;
    const angle = activeBoard.angle != null ? `${activeBoard.angle}°` : null;
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

  const handleCloseOverlays = useCallback(() => {
    searchFieldRef.current?.blur();
    Keyboard.dismiss();
    onCloseGrade();
  }, [onCloseGrade, searchFieldRef]);

  useFocusEffect(useCallback(() => () => handleCloseOverlays(), [handleCloseOverlays]));

  const handleOpenAngleSelector = useCallback(() => {
    if (!activeBoard || activeBoard.isAngleAdjustable === false || activeBoard.angle == null) return;
    hapticLight();
    setAngleSelectorVisible(true);
  }, [activeBoard]);

  const handleCloseAngleSelector = useCallback(() => {
    setAngleSelectorVisible(false);
  }, []);

  const handleAngleChange = useCallback(
    (newAngle: number) => {
      if (!activeBoard || activeBoard.isAngleAdjustable === false || newAngle === activeBoard.angle) return;
      void setActiveBoard({ ...activeBoard, angle: newAngle });
    },
    [activeBoard, setActiveBoard],
  );

  const handleFocus = useCallback(() => {
    onCloseGrade();
    onSearchFocus();
  }, [onCloseGrade, onSearchFocus]);

  const handleBlur = useCallback(() => {
    onSearchBlur();
  }, [onSearchBlur]);

  const canOpenAngleSelector = activeBoard?.isAngleAdjustable !== false && activeBoard?.angle != null;
  const leftActionCount = (canCreate ? 1 : 0) + (canOpenAngleSelector ? 1 : 0);

  // Right toolbar: light/bluetooth only. The filter affordance now lives to the
  // left of the search field (Material) or as the bottom FAB (Liquid Glass).
  const rightActionCount = bluetooth ? 1 : 0;

  return (
    <>
      <View pointerEvents="box-none" style={[styles.container, { paddingTop: insets.top }]} onLayout={handleLayout}>
        {/* Scrim: opaque screen background behind the controls, fading to clear at
            the bottom edge — hides the climb list scrolling up behind the floating
            islands (the gaps between them otherwise bleed list content = clutter). */}
        <LinearGradient
          pointerEvents="none"
          colors={[systemColors.background, systemColors.background, 'transparent'] as const}
          locations={[0, 0.7, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View pointerEvents="box-none" style={styles.row}>
          <View pointerEvents="box-none" style={styles.leftSlot}>
            {canCreate || canOpenAngleSelector ? (
              <View
                style={[
                  styles.actionToolbar,
                  { width: TOP_ACTION_SIZE * leftActionCount },
                  !nativeGlass && shadows.sm,
                  !nativeGlass && { borderWidth: StyleSheet.hairlineWidth, borderColor: systemColors.separator },
                ]}
              >
                <GlassSurface
                  glassEffectStyle="regular"
                  fallbackColor={systemColors.elevatedSurface}
                  borderRadius={TOP_TOOLBAR_RADIUS}
                  style={StyleSheet.absoluteFill}
                  pointerEvents="none"
                />
                {canCreate ? (
                  <PressableSurface
                    onPress={onCreate}
                    feedback="opacity"
                    hitSlop={4}
                    accessibilityRole="button"
                    accessibilityLabel={t('mobile.create.fab.ariaLabel')}
                    style={styles.toolbarAction}
                  >
                    <Icon name="plus" size={24} color={systemColors.label as string} />
                  </PressableSurface>
                ) : null}
                {canOpenAngleSelector ? (
                  <PressableSurface
                    onPress={handleOpenAngleSelector}
                    feedback="opacity"
                    hitSlop={4}
                    accessibilityRole="button"
                    accessibilityLabel={tSession('mobile.angleSelector.title')}
                    style={styles.toolbarAction}
                  >
                    <Text variant="caption1" style={[styles.angleActionText, { color: systemColors.label }]}>
                      {activeBoard.angle}°
                    </Text>
                  </PressableSurface>
                ) : null}
              </View>
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
                    !nativeGlass && shadows.sm,
                    !nativeGlass && { borderWidth: StyleSheet.hairlineWidth, borderColor: systemColors.separator },
                  ]}
                >
                  <GlassSurface
                    glassEffectStyle="regular"
                    fallbackColor={systemColors.elevatedSurface}
                    borderRadius={CAPSULE_RADIUS}
                    style={StyleSheet.absoluteFill}
                    pointerEvents="none"
                  />
                  <Icon name="boards" size={14} color={systemColors.secondaryLabel as string} />
                  <Text
                    variant="caption1"
                    numberOfLines={1}
                    ellipsizeMode="tail"
                    color={systemColors.secondaryLabel as string}
                    style={styles.capsuleText}
                  >
                    {boardLabel}
                  </Text>
                </View>
              </PressableSurface>
            ) : null}
          </View>

          <View pointerEvents="box-none" style={styles.rightSlot}>
            {rightActionCount > 0 ? (
              <View
                style={[
                  styles.actionToolbar,
                  { width: TOP_ACTION_SIZE * rightActionCount },
                  !nativeGlass && shadows.sm,
                  !nativeGlass && { borderWidth: StyleSheet.hairlineWidth, borderColor: systemColors.separator },
                ]}
              >
                <GlassSurface
                  glassEffectStyle="regular"
                  fallbackColor={systemColors.elevatedSurface}
                  borderRadius={TOP_TOOLBAR_RADIUS}
                  style={StyleSheet.absoluteFill}
                  pointerEvents="none"
                />
                {bluetooth ? (
                  <PressableSurface
                    onPress={handleBluetoothPress}
                    feedback="opacity"
                    hitSlop={4}
                    accessibilityRole="button"
                    accessibilityLabel={
                      bluetoothConnected ? tCommon('lightControl.disconnect') : tSettings('ble.connectBoard')
                    }
                    style={styles.toolbarAction}
                  >
                    <Icon
                      name={bluetoothConnected ? 'lightbulb.fill' : 'lightbulb'}
                      size={23}
                      color={bluetoothConnected ? brandColors.warning : (systemColors.label as string)}
                    />
                  </PressableSurface>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>

        {filterSummary ? (
          <View pointerEvents="box-none" style={styles.summaryRow}>
            <PressableSurface
              onPress={() => {
                hapticLight();
                filterSummary.onClear();
              }}
              feedback="scale"
              scaleTo={0.96}
              accessibilityRole="button"
              accessibilityLabel={filterSummary.text}
              accessibilityHint={t('mobile.search.clearAll')}
              style={styles.summaryPress}
            >
              <View
                style={[
                  styles.summaryCapsule,
                  !nativeGlass && shadows.sm,
                  !nativeGlass && { borderWidth: StyleSheet.hairlineWidth, borderColor: systemColors.separator },
                ]}
              >
                <GlassSurface
                  glassEffectStyle="regular"
                  fallbackColor={systemColors.elevatedSurface}
                  borderRadius={SUMMARY_CAPSULE_RADIUS}
                  style={StyleSheet.absoluteFill}
                  pointerEvents="none"
                />
                <Text
                  variant="caption1"
                  numberOfLines={1}
                  ellipsizeMode="tail"
                  color={systemColors.label as string}
                  style={styles.summaryText}
                >
                  {filterSummary.text}
                </Text>
              </View>
            </PressableSurface>
          </View>
        ) : null}

        {usesCustomSearch ? (
          <View pointerEvents="box-none" style={styles.searchStack}>
            <View pointerEvents="box-none" style={styles.searchRow}>
              {variant === 'material' && onOpenFilters ? (
                <FilterButton activeFilterCount={activeFilterCount} onPress={onOpenFilters} />
              ) : null}
              <View pointerEvents="box-none" style={styles.searchSlot}>
                <SearchHeader
                  ref={searchFieldRef}
                  initialValue={searchInitialValue}
                  placeholder={searchPlaceholder}
                  onChangeText={onSearchChange}
                  onFocus={handleFocus}
                  onBlur={handleBlur}
                  height={TOP_ACTION_SIZE}
                />
              </View>
            </View>
          </View>
        ) : null}
      </View>
      {activeBoard ? (
        <AngleSelectorSheet
          visible={angleSelectorVisible}
          onClose={handleCloseAngleSelector}
          boardName={activeBoard.boardType}
          layoutId={activeBoard.layoutId}
          currentAngle={activeBoard.angle}
          onAngleChange={handleAngleChange}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    minHeight: TOP_ACTION_SIZE,
  },
  leftSlot: {
    width: TOP_TOOLBAR_WIDTH,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  centerSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 0,
  },
  rightSlot: {
    width: TOP_TOOLBAR_WIDTH,
    alignItems: 'flex-end',
    justifyContent: 'center',
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
    fontWeight: '500',
    flexShrink: 1,
  },
  actionToolbar: {
    height: TOP_ACTION_SIZE,
    borderRadius: TOP_TOOLBAR_RADIUS,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  toolbarAction: {
    width: TOP_ACTION_SIZE,
    height: TOP_ACTION_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  angleActionText: {
    fontWeight: '700',
  },
  searchStack: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    gap: spacing[2],
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
  },
  searchSlot: {
    flex: 1,
    flexDirection: 'row',
    minWidth: 0,
  },
  summaryRow: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[1],
    alignItems: 'center',
  },
  summaryPress: {
    height: SUMMARY_CAPSULE_HEIGHT,
    maxWidth: 280,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    height: SUMMARY_CAPSULE_HEIGHT,
    borderRadius: SUMMARY_CAPSULE_RADIUS,
    paddingHorizontal: 12,
    gap: 5,
  },
  summaryText: {
    fontWeight: '600',
    flexShrink: 1,
  },
});
