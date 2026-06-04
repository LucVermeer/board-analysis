import { Pressable, StyleSheet, type ViewStyle } from 'react-native';
import { Icon } from '../Icon';
import type { IconName } from '../icon-map';
import { iosSystemColors } from '../../theme/ios-colors';
import { spacing } from '../../theme/tokens';

// Shared building blocks for the Play Drawer and Create Drawer action bars: the
// circular icon button, its size scale, and the two-row container/row styles.
// Both bars import these so the layout grammar never drifts between them.

export type ButtonSize = 'lg' | 'sm';

export const SIZES: Record<ButtonSize, { dim: number; icon: number }> = {
  lg: { dim: 56, icon: 28 },
  sm: { dim: 40, icon: 22 },
};

type ActionButtonProps = {
  iconName: IconName;
  size: ButtonSize;
  onPress: () => void;
  disabled?: boolean;
  active?: boolean;
  activeColor?: string;
  iconColor?: string;
  accessibilityLabel: string;
};

export function ActionButton({
  iconName,
  size,
  onPress,
  disabled = false,
  active = false,
  activeColor,
  iconColor,
  accessibilityLabel,
}: ActionButtonProps) {
  const { dim, icon } = SIZES[size];
  const buttonStyle: ViewStyle[] = [
    drawerActionBarStyles.actionButton,
    { width: dim, height: dim, borderRadius: dim / 2 },
  ];
  if (active && activeColor) {
    buttonStyle.push({ backgroundColor: `${activeColor}20` });
  }

  const resolvedColor = disabled
    ? iosSystemColors.systemGray4
    : (iconColor ?? (active && activeColor ? activeColor : iosSystemColors.systemGray));

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        ...buttonStyle,
        disabled && drawerActionBarStyles.actionButtonDisabled,
        pressed && !disabled && drawerActionBarStyles.actionButtonPressed,
      ]}
    >
      <Icon name={iconName} size={icon} color={resolvedColor} />
    </Pressable>
  );
}

export const drawerActionBarStyles = StyleSheet.create({
  container: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: iosSystemColors.separator,
  },
  rowPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
  },
  primarySlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[4],
    paddingTop: spacing[2],
    paddingBottom: spacing[3],
  },
  spacer: {
    flex: 1,
  },
  actionButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonDisabled: {
    opacity: 0.4,
  },
  actionButtonPressed: {
    opacity: 0.6,
    transform: [{ scale: 0.9 }],
  },
});
