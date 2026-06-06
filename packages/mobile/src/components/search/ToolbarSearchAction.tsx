// Borderless search action for a HIG-style toolbar surface: a plain search SF
// Symbol with an optional active-filter-count badge. The enclosing top toolbar
// provides the glass container, so this stays borderless.

import { StyleSheet, View } from 'react-native';
import { iosSystemColors } from '../../theme/ios-colors';
import { Icon } from '../Icon';
import { PressableSurface } from '../PressableSurface';
import { Text } from '../Text';

type ToolbarSearchActionProps = {
  onPress: () => void;
  accessibilityLabel: string;
  accessibilityHint: string;
  iconColor: string;
  badgeColor: string;
  badgeCount: number;
  size: number;
};

export function ToolbarSearchAction({
  onPress,
  accessibilityLabel,
  accessibilityHint,
  iconColor,
  badgeColor,
  badgeCount,
  size,
}: ToolbarSearchActionProps) {
  const showBadge = badgeCount > 0;

  return (
    <View style={[styles.frame, { width: size, height: size }]}>
      <PressableSurface
        onPress={onPress}
        feedback="opacity"
        hitSlop={4}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        style={[styles.action, { width: size, height: size }]}
      >
        <Icon name="search" size={23} color={iconColor} />
      </PressableSurface>
      {showBadge ? (
        <View style={[styles.badge, { backgroundColor: badgeColor }]} pointerEvents="none">
          <Text variant="caption2" color={iosSystemColors.white} style={styles.badgeText}>
            {badgeCount}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    position: 'relative',
  },
  action: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontWeight: '700',
    fontSize: 10,
    lineHeight: 14,
  },
});
