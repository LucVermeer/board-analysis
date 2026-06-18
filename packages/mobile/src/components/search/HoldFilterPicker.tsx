import { useCallback, useMemo } from 'react';
import { View, Pressable, ScrollView, StyleSheet } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { BoardName, HoldFilterEntry, HoldFilterMode, HoldFilterType } from '@boardsesh/shared-schema';
import { buildHoldFilterOptions } from '@boardsesh/climb-filters';
import { Text } from '../Text';
import { Icon } from '../Icon';
import { SegmentedControl } from '../SegmentedControl';
import { useTheme } from '../../providers/theme-provider';
import { hapticSelection } from '../../lib/haptics';
import { useHoldColorOverrides, type HoldMarkerShape } from '../../lib/hold-color-overrides';
import { spacing, borderRadius, shadowColor } from '../../theme/tokens';
import { HoldMarkerShapeSvg } from '../board-renderer/HoldMarkerShape';
import { getHoldFilterTypeShape } from './hold-filter-visuals';

type HoldFilterPickerProps = {
  /** The hold being edited, or null when the picker is closed. */
  holdId: number | null;
  boardName: BoardName;
  /** Current filter entry for the active hold. */
  entry: HoldFilterEntry;
  applyMode: HoldFilterMode;
  onApplyModeChange: (mode: HoldFilterMode) => void;
  /** Toggle one type's filter on the active hold (the picker owns the cycle). */
  onToggleType: (type: HoldFilterType) => void;
  onClear: () => void;
  onClose: () => void;
};

/**
 * Per-hold hold-type picker. Opened by tapping a hold on the interactive board.
 * Hosts an Include / Exclude apply-mode toggle plus one swatch per hold type
 * (board-filtered) and a Clear button — the native port of the web
 * `HoldTypePicker` search toolbar.
 *
 * Renders as an inline panel docked to the bottom of the host board sheet
 * (visible when `holdId != null`), NOT as its own bottom-sheet modal: a third
 * stacked `BottomSheetModal` over the 95% board sheet would not reliably
 * surface (see #2687 lineage). The host owns dismissal — a tap on the board
 * backdrop or the close button calls `onClose`.
 */
export function HoldFilterPicker({
  holdId,
  boardName,
  entry,
  applyMode,
  onApplyModeChange,
  onToggleType,
  onClear,
  onClose,
}: HoldFilterPickerProps) {
  const { t } = useTranslation('climbs');
  const { systemColors } = useTheme();
  const insets = useSafeAreaInsets();
  const {
    overrides: holdColorOverrides,
    shapes: holdShapeOverrides,
    brushThickness,
    shapeSize,
  } = useHoldColorOverrides();

  const options = useMemo(() => buildHoldFilterOptions(boardName, holdColorOverrides), [boardName, holdColorOverrides]);
  const shapeByType = useMemo(() => {
    const map = new Map<HoldFilterType, HoldMarkerShape>();
    for (const option of options) {
      map.set(option.type, getHoldFilterTypeShape(option.type, holdShapeOverrides));
    }
    return map;
  }, [options, holdShapeOverrides]);

  const typeLabels = useMemo<Record<HoldFilterType, string>>(
    () => ({
      STARTING: t('mobile.holdFilter.type.starting'),
      HAND: t('mobile.holdFilter.type.hand'),
      FINISH: t('mobile.holdFilter.type.finish'),
      FOOT: t('mobile.holdFilter.type.foot'),
      ANY: t('mobile.holdFilter.type.any'),
    }),
    [t],
  );

  const applyModeOptions = useMemo(
    () => [
      { key: 'include' as const, label: t('mobile.holdFilter.include') },
      { key: 'exclude' as const, label: t('mobile.holdFilter.exclude') },
    ],
    [t],
  );

  const isEmpty = Object.keys(entry).length === 0;

  const handleSwatch = useCallback(
    (type: HoldFilterType) => {
      hapticSelection();
      onToggleType(type);
    },
    [onToggleType],
  );

  if (holdId == null) return null;

  return (
    <Animated.View
      entering={FadeInDown.duration(200)}
      exiting={FadeOutDown.duration(160)}
      style={[
        styles.panel,
        { backgroundColor: systemColors.secondaryBackground, paddingBottom: insets.bottom + spacing[3] },
      ]}
    >
      <View style={styles.handleRow}>
        <Text variant="headline">{t('mobile.holdFilter.pickerTitle')}</Text>
        <Pressable
          onPress={onClose}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('mobile.filter.done')}
        >
          <Icon name="close" size={22} color={systemColors.secondaryLabel} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <SegmentedControl
          options={applyModeOptions}
          selectedKey={applyMode}
          onSelect={onApplyModeChange}
          trackColor={systemColors.fill}
          accessibilityLabel={t('mobile.holdFilter.applyModeLabel')}
        />

        <View style={styles.grid}>
          {options.map((option) => {
            const mode = entry[option.type];
            const isActive = mode !== undefined;
            const excluded = mode === 'exclude';
            const accessibilityState = { selected: isActive };
            const stateSuffix = excluded
              ? t('mobile.holdFilter.excludedSuffix')
              : isActive
                ? t('mobile.holdFilter.includedSuffix')
                : '';
            const swatchColor = option.color;
            const swatchShape = shapeByType.get(option.type) ?? 'circle';
            const markerDiameter = 20 * shapeSize;
            const markerStrokeWidth = Math.max(2, 2 * brushThickness);
            return (
              <Pressable
                key={option.type}
                onPress={() => handleSwatch(option.type)}
                accessibilityRole="button"
                accessibilityState={accessibilityState}
                accessibilityLabel={
                  stateSuffix ? `${typeLabels[option.type]}, ${stateSuffix}` : typeLabels[option.type]
                }
                style={[
                  styles.cell,
                  { backgroundColor: systemColors.fill },
                  isActive && { borderColor: swatchColor, borderWidth: 2 },
                ]}
              >
                <View
                  style={[
                    styles.swatch,
                    {
                      backgroundColor: systemColors.secondaryBackground,
                    },
                  ]}
                >
                  <HoldMarkerShapeSvg
                    shape={swatchShape}
                    color={excluded ? '#000000' : swatchColor}
                    diameter={markerDiameter}
                    strokeWidth={excluded ? 0 : markerStrokeWidth}
                    fillOpacity={excluded ? 0.55 : isActive ? 0.32 : 0}
                  />
                  {excluded ? (
                    <View style={styles.excludeIcon}>
                      <Icon name="close" size={12} color="#FFFFFF" />
                    </View>
                  ) : null}
                </View>
                <Text variant="subheadline" style={styles.cellLabel}>
                  {typeLabels[option.type]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          onPress={() => {
            if (isEmpty) return;
            hapticSelection();
            onClear();
          }}
          disabled={isEmpty}
          accessibilityRole="button"
          accessibilityState={{ disabled: isEmpty }}
          accessibilityLabel={t('mobile.holdFilter.clearHold')}
          style={[styles.clearRow, isEmpty && styles.clearDisabled]}
        >
          <Icon name="ascent.attempt" size={16} color={systemColors.secondaryLabel} />
          <Text variant="subheadline" color={systemColors.secondaryLabel}>
            {t('mobile.holdFilter.clearHold')}
          </Text>
        </Pressable>

        <Text variant="footnote" style={[styles.help, { color: systemColors.secondaryLabel }]}>
          {t('mobile.holdFilter.pickerHelp')}
        </Text>
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '70%',
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    gap: spacing[2],
    shadowColor,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 16,
  },
  handleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  scroll: {
    flexShrink: 1,
  },
  scrollContent: {
    gap: spacing[3],
    paddingBottom: spacing[2],
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  cell: {
    // Grow to share the row evenly; the minWidth keeps ~3 per row while letting
    // a short final row (or a board with fewer swatches) stretch to fill.
    flexGrow: 1,
    flexBasis: '28%',
    minWidth: 96,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[2],
    borderRadius: borderRadius.md,
    borderColor: 'transparent',
    borderWidth: 2,
    minHeight: 48,
  },
  swatch: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  excludeIcon: {
    position: 'absolute',
  },
  cellLabel: {
    fontWeight: '600',
    flexShrink: 1,
  },
  clearRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    paddingVertical: spacing[2],
    minHeight: 44,
  },
  clearDisabled: {
    opacity: 0.4,
  },
  help: {
    textAlign: 'center',
    paddingHorizontal: spacing[4],
  },
});
