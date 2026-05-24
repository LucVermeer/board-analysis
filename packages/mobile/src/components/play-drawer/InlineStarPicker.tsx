import React, { useCallback } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Icon } from '../Icon';
import { brandColors } from '../../theme/colors';
import { iosSystemColors } from '../../theme/ios-colors';
import { hapticSelection } from '../../lib/haptics';
import { spacing } from '../../theme/tokens';

type InlineStarPickerProps = {
  quality: number | null;
  onSelect: (value: number | null) => void;
};

export const InlineStarPicker = React.memo(function InlineStarPicker({
  quality,
  onSelect,
}: InlineStarPickerProps) {
  const handlePress = useCallback(
    (value: number) => {
      hapticSelection();
      onSelect(quality === value ? null : value);
    },
    [quality, onSelect],
  );

  return (
    <View style={styles.container}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Pressable
          key={star}
          onPress={() => handlePress(star)}
          accessibilityRole="button"
          accessibilityLabel={`${star} star${star > 1 ? 's' : ''}`}
          accessibilityState={{ selected: quality === star }}
          style={styles.starButton}
        >
          <Icon
            name={quality != null && star <= quality ? 'star.fill' : 'star'}
            size={24}
            color={quality != null && star <= quality ? brandColors.warning : iosSystemColors.systemGray4}
          />
        </Pressable>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
  },
  starButton: {
    padding: spacing[1],
  },
});
