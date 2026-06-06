// Top chrome for the climbs list. On native-search devices, Expo's stack search
// bar owns text input and this chrome carries board/angle/create/light controls.
// On fallback devices, it also keeps a custom climb-name search row; in both
// modes the filter action owns the full filter sheet and long-press grade rail.

import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, Pressable, type LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { Grade } from '@boardsesh/shared-schema';
import type { GradeBound } from '@boardsesh/climb-filters';
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
import { GradeRangeRail } from '../grade';
import { AngleSelectorSheet } from '../play-drawer/AngleSelectorSheet';
import { iosSystemColors } from '../../theme/ios-colors';

const CAPSULE_RADIUS = glassSize.capsule / 2;
const TOP_ACTION_SIZE = glassSize.standard;
const TOP_TOOLBAR_WIDTH = TOP_ACTION_SIZE * 2;
const TOP_TOOLBAR_RADIUS = TOP_ACTION_SIZE / 2;

type ClimbTopChromeProps = {
  searchMode?: 'custom' | 'native';
  canCreate: boolean;
  onCreate: () => void;
  onOpenBoardDetail: () => void;
  onHeightChange: (height: number) => void;
  includeTopInset?: boolean;
  searchFieldRef: RefObject<SearchHeaderHandle | null>;
  searchInitialValue: string;
  searchPlaceholder: string;
  onSearchChange: (text: string) => void;
  onSearchFocus: () => void;
  onSearchBlur: () => void;
  bound: GradeBound;
  grades: readonly Grade[];
  activeFilterCount: number;
  gradeRailVisible: boolean;
  onOpenGrade: () => void;
  onCloseGrade: () => void;
  onGradeChange: (grade: GradeBound) => void;
  onOpenFilters: () => void;
};

export function ClimbTopChrome({
  searchMode = 'custom',
  canCreate,
  onCreate,
  onOpenBoardDetail,
  onHeightChange,
  includeTopInset = true,
  searchFieldRef,
  searchInitialValue,
  searchPlaceholder,
  onSearchChange,
  onSearchFocus,
  onSearchBlur,
  bound,
  grades,
  activeFilterCount,
  gradeRailVisible,
  onOpenGrade,
  onCloseGrade,
  onGradeChange,
  onOpenFilters,
}: ClimbTopChromeProps) {
  const { t } = useTranslation('climbs');
  const { t: tSettings } = useTranslation('settings');
  const { t: tCommon } = useTranslation('common');
  const { t: tSession } = useTranslation('session');
  const { systemColors, brandColors } = useTheme();
  const nativeGlass = useNativeGlass();
  const insets = useSafeAreaInsets();
  const { data: activeBoard } = useActiveBoard();
  const setActiveBoard = useSetActiveBoard();
  const bluetooth = useOptionalBluetoothContext();
  const bluetoothConnected = bluetooth?.isConnected ?? false;
  const [angleSelectorVisible, setAngleSelectorVisible] = useState(false);
  const suppressFilterPressRef = useRef(false);
  const suppressionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const usesCustomSearch = searchMode === 'custom';

  useEffect(
    () => () => {
      if (suppressionTimerRef.current) clearTimeout(suppressionTimerRef.current);
    },
    [],
  );

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

  const handleOpenGrade = useCallback(() => {
    hapticLight();
    searchFieldRef.current?.blur();
    Keyboard.dismiss();
    onOpenGrade();
  }, [onOpenGrade, searchFieldRef]);

  const handleOpenFilters = useCallback(() => {
    hapticLight();
    searchFieldRef.current?.blur();
    Keyboard.dismiss();
    onCloseGrade();
    onOpenFilters();
  }, [onCloseGrade, onOpenFilters, searchFieldRef]);

  const handleFilterPress = useCallback(() => {
    if (suppressFilterPressRef.current) {
      suppressFilterPressRef.current = false;
      return;
    }
    handleOpenFilters();
  }, [handleOpenFilters]);

  const handleFilterLongPress = useCallback(() => {
    suppressFilterPressRef.current = true;
    if (suppressionTimerRef.current) clearTimeout(suppressionTimerRef.current);
    suppressionTimerRef.current = setTimeout(() => {
      suppressFilterPressRef.current = false;
    }, 350);
    handleOpenGrade();
  }, [handleOpenGrade]);

  const canOpenAngleSelector = activeBoard?.isAngleAdjustable !== false && activeBoard?.angle != null;
  const filtersActive = activeFilterCount > 0;

  return (
    <>
      {gradeRailVisible ? (
        <Pressable
          style={styles.scrim}
          onPress={onCloseGrade}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      ) : null}

      <View
        pointerEvents="box-none"
        style={[styles.container, { paddingTop: includeTopInset ? insets.top : 0 }]}
        onLayout={handleLayout}
      >
        <View pointerEvents="box-none" style={styles.row}>
          <View pointerEvents="box-none" style={styles.leftSlot}>
            {canCreate || canOpenAngleSelector ? (
              <View
                style={[
                  styles.actionToolbar,
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
                ) : (
                  <View pointerEvents="none" style={styles.toolbarAction} />
                )}
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
                ) : (
                  <View pointerEvents="none" style={styles.toolbarAction} />
                )}
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
                  <Text variant="footnote" numberOfLines={1} ellipsizeMode="tail" style={styles.capsuleText}>
                    {boardLabel}
                  </Text>
                </View>
              </PressableSurface>
            ) : null}
          </View>

          <View pointerEvents="box-none" style={styles.rightSlot}>
            <View
              style={[
                styles.actionToolbar,
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
              ) : (
                <View pointerEvents="none" style={styles.toolbarAction} />
              )}
              <PressableSurface
                onPress={handleFilterPress}
                onLongPress={handleFilterLongPress}
                feedback="opacity"
                hitSlop={4}
                accessibilityRole="button"
                accessibilityLabel={
                  filtersActive ? `${t('mobile.search.filters')}, ${activeFilterCount}` : t('mobile.search.filters')
                }
                accessibilityHint={t('mobile.search.filterHint')}
                style={styles.toolbarAction}
              >
                <Icon
                  name="filter"
                  size={23}
                  color={filtersActive ? brandColors.primary : (systemColors.label as string)}
                />
                {filtersActive ? (
                  <View style={[styles.filterBadge, { backgroundColor: brandColors.primary }]} pointerEvents="none">
                    <Text variant="caption2" color={iosSystemColors.white} style={styles.filterBadgeText}>
                      {activeFilterCount}
                    </Text>
                  </View>
                ) : null}
              </PressableSurface>
            </View>
          </View>
        </View>

        {usesCustomSearch ? (
          <View pointerEvents="box-none" style={styles.searchStack}>
            {gradeRailVisible ? (
              <View style={styles.gradeRailSlot}>
                <GradeRangeRail grades={grades} bound={bound} onChange={onGradeChange} onRequestClose={onCloseGrade} />
              </View>
            ) : null}
            <View pointerEvents="box-none" style={styles.searchRow}>
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
        ) : gradeRailVisible ? (
          <View pointerEvents="box-none" style={styles.nativeSearchStack}>
            <View style={styles.nativeGradeRailSlot}>
              <GradeRangeRail grades={grades} bound={bound} onChange={onGradeChange} onRequestClose={onCloseGrade} />
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
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 18,
  },
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
    fontWeight: '600',
    flexShrink: 1,
  },
  actionToolbar: {
    width: TOP_TOOLBAR_WIDTH,
    height: TOP_ACTION_SIZE,
    borderRadius: TOP_TOOLBAR_RADIUS,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  filterBadge: {
    position: 'absolute',
    top: 8,
    right: 7,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadgeText: {
    fontWeight: '700',
    fontSize: 10,
    lineHeight: 14,
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
    gap: spacing[2],
  },
  searchSlot: {
    flex: 1,
    flexDirection: 'row',
    minWidth: 0,
  },
  gradeRailSlot: {
    marginBottom: spacing[1],
  },
  nativeSearchStack: {
    gap: spacing[2],
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[2],
  },
  nativeGradeRailSlot: {
    marginTop: spacing[1],
  },
});
