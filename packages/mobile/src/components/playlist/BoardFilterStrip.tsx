import { useCallback } from 'react';
import { View, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { UserBoard } from '@boardsesh/shared-schema';
import { Text } from '../Text';
import { hapticSelection } from '../../lib/haptics';
import { brandColors } from '../../theme/colors';
import { iosSystemColors } from '../../theme/ios-colors';
import { spacing } from '../../theme/tokens';

/** The board filter applied to every playlist section, or null for "All". */
export type BoardFilterSelection = {
  uuid: string;
  boardType: string;
  layoutId: number;
};

export type BoardFilterStripProps = {
  boards: UserBoard[];
  /** uuid of the selected board, or null when the "All" chip is active. */
  selectedBoardUuid: string | null;
  onSelect: (selection: BoardFilterSelection | null) => void;
};

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const handlePress = useCallback(() => {
    hapticSelection();
    onPress();
  }, [onPress]);

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      style={[styles.chip, active ? styles.chipActive : styles.chipInactive]}
    >
      <Text
        variant="caption1"
        color={active ? brandColors.primary : undefined}
        numberOfLines={1}
        style={styles.chipLabel}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Horizontal chip row of the user's boards plus an "All" chip. Selecting a chip
 * filters every playlist section below to that board's `boardType` + `layoutId`.
 * Renders nothing when the user has a single board (or none) — there's nothing
 * to filter between.
 */
export function BoardFilterStrip({ boards, selectedBoardUuid, onSelect }: BoardFilterStripProps) {
  const { t } = useTranslation('boards');

  if (boards.length < 2) return null;

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
      >
        <Chip label={t('boardFilterStrip.all')} active={selectedBoardUuid === null} onPress={() => onSelect(null)} />
        {boards.map((board) => (
          <Chip
            key={board.uuid}
            label={board.name}
            active={selectedBoardUuid === board.uuid}
            onPress={() => onSelect({ uuid: board.uuid, boardType: board.boardType, layoutId: board.layoutId })}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: spacing[2],
    paddingBottom: spacing[1],
  },
  list: {
    paddingHorizontal: spacing[4],
    gap: spacing[2],
  },
  chip: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: 20,
    borderWidth: 1,
  },
  chipActive: {
    borderColor: brandColors.primary,
    backgroundColor: `${brandColors.primary}14`,
  },
  chipInactive: {
    borderColor: iosSystemColors.separator,
    backgroundColor: 'transparent',
  },
  chipLabel: {
    fontWeight: '500',
    maxWidth: 160,
  },
});
