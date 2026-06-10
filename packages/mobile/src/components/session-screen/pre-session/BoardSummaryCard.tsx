import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Card } from '../../Card';
import { Text } from '../../Text';
import { Icon } from '../../Icon';
import { useTheme } from '../../../providers/theme-provider';
import { spacing } from '../../../theme/tokens';

type BoardSummaryCardProps = {
  /** Open the board switcher (the Boards tab, where the cascading picker lives). */
  onPress: () => void;
};

/**
 * No-board prompt for the pre-session screen. Once a board is set the chrome's
 * board pill owns the board identity, so this renders only when none is chosen —
 * a card guiding the climber to the Boards tab, which is the single source of
 * truth for board configuration. Laid out as a `ListRow`-style leading icon /
 * label / chevron, drawn inside `Card` (so it picks up the glass-vs-material
 * surface) without `ListRow`'s extra inset doubling the card padding.
 */
export function BoardSummaryCard({ onPress }: BoardSummaryCardProps) {
  const { t } = useTranslation('session');
  const { systemColors } = useTheme();

  return (
    <Card onPress={onPress}>
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
    </Card>
  );
}

const styles = StyleSheet.create({
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
