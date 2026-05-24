import React, { useCallback } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Text } from '../Text';
import { Icon } from '../Icon';
import { iosSystemColors } from '../../theme/ios-colors';
import { hapticLight } from '../../lib/haptics';
import { spacing } from '../../theme/tokens';

type InlineTriesPickerProps = {
  attemptCount: number;
  minAttempts?: number;
  onSelect: (value: number) => void;
};

export const InlineTriesPicker = React.memo(function InlineTriesPicker({
  attemptCount,
  minAttempts = 1,
  onSelect,
}: InlineTriesPickerProps) {
  const handleDecrement = useCallback(() => {
    hapticLight();
    onSelect(Math.max(minAttempts, attemptCount - 1));
  }, [attemptCount, minAttempts, onSelect]);

  const handleIncrement = useCallback(() => {
    hapticLight();
    onSelect(attemptCount + 1);
  }, [attemptCount, onSelect]);

  return (
    <View style={styles.container}>
      <Pressable
        onPress={handleDecrement}
        disabled={attemptCount <= minAttempts}
        accessibilityRole="button"
        accessibilityLabel="Decrease attempts"
        style={[styles.button, attemptCount <= minAttempts && styles.buttonDisabled]}
      >
        <Icon name="minus" size={18} color={iosSystemColors.systemGray} />
      </Pressable>

      <View style={styles.countContainer}>
        <Text variant="headline" style={styles.countText}>
          {attemptCount}
        </Text>
      </View>

      <Pressable
        onPress={handleIncrement}
        accessibilityRole="button"
        accessibilityLabel="Increase attempts"
        style={styles.button}
      >
        <Icon name="plus" size={18} color={iosSystemColors.systemGray} />
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
  },
  button: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(120, 120, 128, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.3,
  },
  countContainer: {
    minWidth: 32,
    alignItems: 'center',
  },
  countText: {
    fontVariant: ['tabular-nums'],
  },
});
