import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '../Text';
import { iosSystemColors } from '../../theme/ios-colors';
import { spacing, borderRadius } from '../../theme/tokens';

/**
 * Status banner shown in the play drawer when the displayed climb is the live
 * wall climb behind the accessory bar — a peer (or another climber on this
 * board) is driving the wall over BLE and this climb is physically lit right
 * now. Unlike {@link PlayDrawerPreviewBanner}, there's no "Set active": the
 * climb isn't a browse preview to promote, it's already on the wall. So this is
 * a read-only status chip, no affordance.
 */
export const PlayDrawerOnWallBanner = memo(function PlayDrawerOnWallBanner() {
  const { t } = useTranslation('session');

  return (
    <View style={styles.row}>
      <View style={styles.chip}>
        <Text variant="caption1" color={iosSystemColors.white} style={styles.chipLabel}>
          {t('playView.onWallBadge')}
        </Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing[4],
    marginTop: spacing[1],
    marginBottom: spacing[2],
  },
  chip: {
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1] / 2,
    borderRadius: borderRadius.sm,
    backgroundColor: iosSystemColors.systemGreen,
  },
  chipLabel: {
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
