// The filters affordance shared by the top search row and the bottom card: a
// Liquid Glass circle that tints violet and shows a count badge when filters are
// active. Tapping opens the full filter sheet.

import { useTranslation } from 'react-i18next';
import { GlassIconButton } from '../GlassIconButton';
import { useTheme } from '../../providers/theme-provider';
import { selectByVariant } from '../../theme/variants';
import { withAlpha } from '../../theme/colors';
import { iosSystemColors } from '../../theme/ios-colors';
import { glassSize } from '../../theme/layout';

export const FILTER_FAB_SIZE = glassSize.inlinePrimary;

type FilterButtonProps = {
  activeFilterCount: number;
  onPress: () => void;
  onLongPress?: () => void;
  prominence?: 'standard' | 'floating';
};

export function FilterButton({ activeFilterCount, onPress, onLongPress, prominence = 'standard' }: FilterButtonProps) {
  const { t } = useTranslation('climbs');
  const { systemColors, brandColors, variant } = useTheme();
  const active = activeFilterCount > 0;
  const floatingLiquidGlass =
    prominence === 'floating' && selectByVariant(variant, { liquidGlass: true, material: false });
  let iconColor = systemColors.secondaryLabel;
  let tintColor: string | undefined;
  let fallbackColor = systemColors.fill;

  if (floatingLiquidGlass) {
    iconColor = brandColors.onPrimary;
    tintColor = brandColors.primaryFill;
    fallbackColor = brandColors.primaryFill;
  } else if (active) {
    // Liquid Glass paints the active button on a violet glass tint, so a violet
    // glyph is low-contrast. Material has no tint behind the glyph.
    iconColor = selectByVariant(variant, { liquidGlass: iosSystemColors.white, material: brandColors.primary });
    tintColor = withAlpha(brandColors.primary, 0.18);
    fallbackColor = withAlpha(brandColors.primary, 0.16);
  }

  return (
    <GlassIconButton
      iconName="filter"
      iconColor={iconColor}
      iconSize={20}
      size={FILTER_FAB_SIZE}
      onPress={onPress}
      accessibilityLabel={
        active ? t('mobile.search.filterCountAria', { count: activeFilterCount }) : t('mobile.search.filters')
      }
      accessibilityHint={onLongPress ? t('mobile.search.filterHint') : undefined}
      onLongPress={onLongPress}
      // The long-press opens the grade rail, but a raw long-press is invisible
      // to VoiceOver / Switch Control. Expose it as a named action so assistive
      // tech can reach grade selection too (the Filters sheet stays the fallback).
      accessibilityActions={onLongPress ? [{ name: 'grade', label: t('mobile.search.gradeAction') }] : undefined}
      onAccessibilityAction={
        onLongPress
          ? (event) => {
              if (event.nativeEvent.actionName === 'grade') onLongPress();
            }
          : undefined
      }
      tintColor={tintColor}
      fallbackColor={fallbackColor}
      badgeCount={activeFilterCount}
      badgeBackgroundColor={floatingLiquidGlass ? brandColors.onPrimary : undefined}
      badgeTextColor={floatingLiquidGlass ? brandColors.primaryFill : undefined}
    />
  );
}
