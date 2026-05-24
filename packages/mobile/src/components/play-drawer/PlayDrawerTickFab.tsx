import { memo, useCallback } from 'react';
import { Pressable, View, StyleSheet } from 'react-native';
import { Text } from '../Text';
import { Icon } from '../Icon';
import { brandColors } from '../../theme/colors';
import { iosSystemColors } from '../../theme/ios-colors';
import { hapticMedium } from '../../lib/haptics';
import { shadows } from '../../theme/tokens';

type PlayDrawerTickFabProps = {
  ascentCount: number;
  onPress: () => void;
};

export const PlayDrawerTickFab = memo(function PlayDrawerTickFab({
  ascentCount,
  onPress,
}: PlayDrawerTickFabProps) {
  const handlePress = useCallback(() => {
    hapticMedium();
    onPress();
  }, [onPress]);

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={ascentCount > 0 ? `Log ascent, ${ascentCount} logged` : 'Log ascent'}
      style={({ pressed }) => [
        styles.fab,
        pressed && styles.fabPressed,
      ]}
    >
      <Icon name="tick.outline" size={20} color={iosSystemColors.white} />
      {ascentCount > 0 && (
        <View style={styles.countBadge}>
          <Text variant="caption2" color={iosSystemColors.white} style={styles.countText}>
            {ascentCount > 99 ? '99' : String(ascentCount)}
          </Text>
        </View>
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: 12,
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: brandColors.success,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    ...shadows.md,
  },
  fabPressed: {
    transform: [{ scale: 0.92 }],
    opacity: 0.9,
  },
  countBadge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: brandColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  countText: {
    fontSize: 10,
    fontWeight: '600',
    lineHeight: 12,
  },
});
