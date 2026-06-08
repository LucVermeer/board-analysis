import { View, Platform, StyleSheet } from 'react-native';
import { Text } from './Text';
import { Icon } from './Icon';
import { PressableSurface } from './PressableSurface';
import { useTheme } from '../providers/theme-provider';

type SectionHeaderProps = {
  title: string;
  /** Trailing affordance label (e.g. "See all"). Renders a tappable action on
   *  the right of the header when paired with `onActionPress`. */
  actionLabel?: string;
  onActionPress?: () => void;
};

export function SectionHeader({ title, actionLabel, onActionPress }: SectionHeaderProps) {
  const { brandColors } = useTheme();
  const displayTitle = Platform.OS === 'ios' ? title.toUpperCase() : title;
  const showAction = !!actionLabel && !!onActionPress;

  return (
    <View style={[styles.container, showAction && styles.containerWithAction]}>
      <Text variant="footnote" style={styles.text}>
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
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 8,
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
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  actionText: {
    fontWeight: '600',
  },
});
