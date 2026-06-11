import { View, Platform, StyleSheet } from 'react-native';
import { Text } from './Text';
import { Icon } from './Icon';
import { PressableSurface } from './PressableSurface';
import { useTheme } from '../providers/theme-provider';
import { spacing } from '../theme/tokens';

type SectionHeaderProps = {
  title: string;
  /** Trailing affordance label (e.g. "See all"). Renders a tappable action on
   *  the right of the header when paired with `onActionPress`. */
  actionLabel?: string;
  onActionPress?: () => void;
};

export function SectionHeader({ title, actionLabel, onActionPress }: SectionHeaderProps) {
  const { brandColors, variant, m3 } = useTheme();
  const isMaterial = variant === 'material';
  // M3 list/section headers are sentence-case titleSmall in onSurfaceVariant — not
  // the iOS group-caption (uppercased, dimmed, tracked-out footnote). So Material
  // drops the uppercasing + 0.6 opacity + letter-spacing and lifts to titleSmall.
  const displayTitle = isMaterial ? title : Platform.OS === 'ios' ? title.toUpperCase() : title;
  const showAction = !!actionLabel && !!onActionPress;

  return (
    <View style={[styles.container, showAction && styles.containerWithAction]}>
      <Text
        variant={isMaterial ? 'subheadline' : 'footnote'}
        color={isMaterial ? m3.onSurfaceVariant : undefined}
        style={isMaterial ? styles.materialText : styles.text}
      >
        {displayTitle}
      </Text>
      {showAction ? (
        <PressableSurface
          onPress={onActionPress}
          feedback="opacity"
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          style={styles.action}
        >
          <Text variant="footnote" color={brandColors.primary} style={styles.actionText}>
            {actionLabel}
          </Text>
          <Icon name="chevron.right" size={12} color={brandColors.primary} />
        </PressableSurface>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[6],
    paddingBottom: spacing[2],
  },
  containerWithAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  text: {
    opacity: 0.6,
    letterSpacing: 0.5,
  },
  // M3 titleSmall weight (the `subheadline` material scale is 14/400; titleSmall
  // is 14/500). No opacity/letter-spacing — onSurfaceVariant carries the hierarchy.
  materialText: {
    fontWeight: '500',
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  actionText: {
    fontWeight: '600',
  },
});
