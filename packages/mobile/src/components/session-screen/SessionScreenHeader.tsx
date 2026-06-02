import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '../Text';
import { Icon } from '../Icon';
import { useTheme } from '../../providers/theme-provider';
import { spacing } from '../../theme/tokens';

type SessionScreenHeaderProps = {
  onClose: () => void;
  sessionActive: boolean;
};

/**
 * Compact header strip for the session overlay. Left: chevron-down to minimize
 * (session stays alive — the tab icon then blinks). Center: contextual title.
 */
export function SessionScreenHeader({ onClose, sessionActive }: SessionScreenHeaderProps) {
  const { t } = useTranslation('session');
  const { systemColors } = useTheme();

  const title = sessionActive ? t('mobile.session.headerActive') : t('mobile.session.headerStart');

  return (
    <View style={styles.row}>
      <Pressable
        onPress={onClose}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={t('mobile.session.minimize')}
        style={styles.iconButton}
      >
        <Icon name="chevron.down" size={26} color={systemColors.label} />
      </Pressable>
      <Text variant="title3" color={systemColors.label} style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.iconButton} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontWeight: '600',
  },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
