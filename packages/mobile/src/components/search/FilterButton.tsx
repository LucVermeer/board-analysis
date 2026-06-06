// The filters affordance shared by the top search row and the bottom card: a
// Liquid Glass circle that tints maroon and shows a count badge when filters are
// active. Tapping opens the full filter sheet.

import { useTranslation } from 'react-i18next';
import { GlassIconButton } from '../GlassIconButton';
import { useTheme } from '../../providers/theme-provider';
import { withAlpha } from '../../theme/colors';
import { glassSize } from '../../theme/layout';

type FilterButtonProps = {
  activeFilterCount: number;
  onPress: () => void;
  onLongPress?: () => void;
};

export function FilterButton({ activeFilterCount, onPress, onLongPress }: FilterButtonProps) {
  const { t } = useTranslation('climbs');
  const { systemColors, brandColors } = useTheme();
  const active = activeFilterCount > 0;

  return (
    <GlassIconButton
      iconName="filter"
      iconColor={active ? brandColors.primary : (systemColors.secondaryLabel as string)}
      size={glassSize.standard}
      onPress={onPress}
      accessibilityLabel={active ? `${t('mobile.search.filters')}, ${activeFilterCount}` : t('mobile.search.filters')}
      accessibilityHint={onLongPress ? t('mobile.search.filterHint') : undefined}
      onLongPress={onLongPress}
      tintColor={active ? withAlpha(brandColors.primary, 0.18) : undefined}
      fallbackColor={active ? withAlpha(brandColors.primary, 0.16) : systemColors.fill}
      badgeCount={activeFilterCount}
    />
  );
}
