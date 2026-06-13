import { useCallback, useEffect, useMemo, useRef } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { useTranslation } from 'react-i18next';
import type { BoardName, HoldFilterEntry, HoldFilterMode, HoldFilterType } from '@boardsesh/shared-schema';
import { buildHoldFilterOptions } from '@boardsesh/climb-filters';
import { ModalSheet } from '../ModalSheet';
import { Text } from '../Text';
import { Icon } from '../Icon';
import { SegmentedControl } from '../SegmentedControl';
import { useTheme } from '../../providers/theme-provider';
import { hapticSelection } from '../../lib/haptics';
import { useHoldColorOverrides, type HoldMarkerShape } from '../../lib/hold-color-overrides';
import { spacing, borderRadius } from '../../theme/tokens';
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
 * `HoldTypePicker` search toolbar. Works in both UI variants: the chrome comes
 * from `ModalSheet` (glass / Material via theme) and `SegmentedControl`.
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
  const {
    overrides: holdColorOverrides,
    shapes: holdShapeOverrides,
    brushThickness,
    shapeSize,
  } = useHoldColorOverrides();
  const sheetRef = useRef<BottomSheetModal>(null);

  useEffect(() => {
    if (holdId != null) {
      sheetRef.current?.present();
    } else {
      sheetRef.current?.dismiss();
    }
  }, [holdId]);

  const options = useMemo(() => buildHoldFilterOptions(boardName, holdColorOverrides), [boardName, holdColorOverrides]);
  const shapeByType = useMemo(() => {
    const map = new Map<HoldFilterType, HoldMarkerShape>();
    for (const option of options) {
      map.set(option.type, getHoldFilterTypeShape(option.type, holdShapeOverrides));
    }
    return map;
  }, [options, holdShapeOverrides]);
  const snapPoints = useMemo(() => ['62%', '90%'], []);

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

  return (
    <ModalSheet
      ref={sheetRef}
      snapPoints={snapPoints}
      onDismiss={onClose}
      enablePanDownToClose
      stackBehavior="push"
      scrollable
    >
      <View style={styles.content}>
        <Text variant="headline" style={styles.title}>
          {t('mobile.holdFilter.pickerTitle')}
        </Text>

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
      </View>
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[2],
    gap: spacing[3],
  },
  title: {
    textAlign: 'center',
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
