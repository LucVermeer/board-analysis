import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { UserBoard } from '@boardsesh/shared-schema';
import { Text } from '../../Text';
import { Icon } from '../../Icon';
import { useTheme } from '../../../providers/theme-provider';
import { spacing, borderRadius } from '../../../theme/tokens';

type BoardSummaryCardProps = {
  board: UserBoard | null;
};

const cap = (value: string) => (value ? value.charAt(0).toUpperCase() + value.slice(1) : value);

/**
 * Compact summary of the user's active board. Tapping the card jumps to the
 * Boards tab where the existing picker lives — we don't duplicate that UI
 * inline; the cascading sheet there is the one source of truth for board
 * configuration.
 */
export function BoardSummaryCard({ board }: BoardSummaryCardProps) {
  const { t } = useTranslation('session');
  const { systemColors } = useTheme();
  const router = useRouter();

  const goToBoards = () => {
    router.push('/boards');
  };

  if (!board) {
    return (
      <Pressable
        onPress={goToBoards}
        style={[
          styles.card,
          { backgroundColor: systemColors.secondaryBackground, borderColor: systemColors.separator },
        ]}
        accessibilityRole="button"
      >
        <View style={styles.row}>
          <Icon name="boards" size={22} color={systemColors.secondaryLabel} />
          <View style={styles.textColumn}>
            <Text variant="footnote" color={systemColors.secondaryLabel}>
              {t('mobile.session.preBoardLabel')}
            </Text>
            <Text variant="body" color={systemColors.label}>
              {t('mobile.session.preNoBoard')}
            </Text>
          </View>
          <Icon name="chevron.right" size={18} color={systemColors.tertiaryLabel} />
        </View>
      </Pressable>
    );
  }

  const summary = [
    cap(board.boardType),
    board.sizeName ?? board.layoutName,
    board.angle != null ? `${board.angle}°` : null,
  ]
    .filter(Boolean)
    .join(' • ');

  return (
    <Pressable
      onPress={goToBoards}
      style={[styles.card, { backgroundColor: systemColors.secondaryBackground, borderColor: systemColors.separator }]}
      accessibilityRole="button"
    >
      <View style={styles.row}>
        <Icon name="boards" size={22} color={systemColors.label} />
        <View style={styles.textColumn}>
          <Text variant="footnote" color={systemColors.secondaryLabel}>
            {t('mobile.session.preBoardLabel')}
          </Text>
          <Text variant="body" color={systemColors.label} numberOfLines={1}>
            {board.name ?? board.layoutName ?? cap(board.boardType)}
          </Text>
          <Text variant="caption1" color={systemColors.secondaryLabel} numberOfLines={1}>
            {summary}
          </Text>
        </View>
        <Icon name="chevron.right" size={18} color={systemColors.tertiaryLabel} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  textColumn: {
    flex: 1,
    gap: 2,
  },
});
