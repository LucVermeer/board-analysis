import { useCallback, useMemo } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
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
import { spacing, borderRadius } from '../../theme/tokens';
import { HoldMarkerShapeSvg } from '../board-renderer/HoldMarkerShape';
import { getHoldFilterTypeShape } from './hold-filter-visuals';

type HoldFilterPickerProps = {
  /** The hold being edited, or null when no hold is selected on the board. */
  holdId: number | null;
  boardName: BoardName;
  /** Current filter entry for the active hold. */
  entry: HoldFilterEntry;
  applyMode: HoldFilterMode;
  onApplyModeChange: (mode: HoldFilterMode) => void;
  /** Toggle one type's filter on the active hold (the picker owns the cycle). */
  onToggleType: (type: HoldFilterType) => void;
  onClear: () => void;
};

/**
 * Hold-type filter controls, docked below the board in the filter sheet — the
 * same layout shape as the create-climb action bar (an Include / Exclude
 * apply-mode toggle above a single row of hold-type chips). Always on screen;
 * it edits whichever hold is selected on the board. Until a hold is tapped the
 * chips are disabled and a hint explains the gesture.
 *
 * This is NOT a stacked sub-sheet: a third `BottomSheetModal` over the 95%
 * board sheet would not reliably surface, so the controls live inline in the
 * board sheet instead.
 */
export function HoldFilterPicker({
  holdId,
  boardName,
  entry,
  applyMode,
  onApplyModeChange,
  onToggleType,
  onClear,
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

  const isActive = holdId != null;

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

  return (
    <View
      style={[styles.section, { borderTopColor: systemColors.separator, paddingBottom: insets.bottom + spacing[3] }]}
    >
      <SegmentedControl
        options={applyModeOptions}
        selectedKey={applyMode}
        onSelect={onApplyModeChange}
        trackColor={systemColors.fill}
        accessibilityLabel={t('mobile.holdFilter.applyModeLabel')}
      />

      <View style={styles.chipRow}>
        {options.map((option) => {
          const mode = entry[option.type];
          const selected = mode !== undefined;
          const excluded = mode === 'exclude';
          const stateSuffix = excluded
            ? t('mobile.holdFilter.excludedSuffix')
            : selected
              ? t('mobile.holdFilter.includedSuffix')
              : '';
          const swatchColor = option.color;
          const swatchShape = shapeByType.get(option.type) ?? 'circle';
          const markerDiameter = 22 * shapeSize;
          const markerStrokeWidth = Math.max(2, 2 * brushThickness);
          return (
            <Pressable
              key={option.type}
              onPress={() => handleSwatch(option.type)}
              disabled={!isActive}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled: !isActive }}
              accessibilityLabel={stateSuffix ? `${typeLabels[option.type]}, ${stateSuffix}` : typeLabels[option.type]}
              style={[
                styles.chip,
                { backgroundColor: systemColors.fill },
                selected && { borderColor: swatchColor, borderWidth: 2 },
                !isActive && styles.chipDisabled,
              ]}
            >
              <View style={styles.chipSwatch}>
                <HoldMarkerShapeSvg
                  shape={swatchShape}
                  color={excluded ? '#000000' : swatchColor}
                  diameter={markerDiameter}
                  strokeWidth={excluded ? 0 : markerStrokeWidth}
                  fillOpacity={excluded ? 0.55 : selected ? 0.32 : 0}
                />
                {excluded ? (
                  <View style={styles.excludeIcon}>
                    <Icon name="close" size={12} color="#FFFFFF" />
                  </View>
                ) : null}
              </View>
              <Text variant="caption1" style={styles.chipLabel} numberOfLines={1}>
                {typeLabels[option.type]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {isActive ? (
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
      ) : (
        <Text variant="footnote" style={[styles.hint, { color: systemColors.secondaryLabel }]}>
          {t('mobile.holdFilter.hint')}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    gap: spacing[3],
    borderTopWidth: StyleSheet.hairlineWidth,
    // borderTopColor applied inline from systemColors.separator (scheme-aware).
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: spacing[2],
  },
  chip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[1],
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[1],
    borderRadius: borderRadius.md,
    borderColor: 'transparent',
    borderWidth: 2,
    minHeight: 64,
  },
  chipDisabled: {
    opacity: 0.4,
  },
  chipSwatch: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  excludeIcon: {
    position: 'absolute',
  },
  chipLabel: {
    fontWeight: '600',
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
  hint: {
    textAlign: 'center',
    minHeight: 44,
    paddingHorizontal: spacing[4],
  },
});
