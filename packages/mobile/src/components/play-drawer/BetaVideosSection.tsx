import { memo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '../Text';
import { Icon } from '../Icon';
import { iosSystemColors } from '../../theme/ios-colors';
import { spacing } from '../../theme/tokens';

type BetaVideosSectionProps = {
  climbUuid: string;
  boardName: string;
};

/**
 * Stub implementation -- renders a placeholder until the GraphQL
 * beta-videos query is wired on mobile. Once available, this will
 * show video thumbnails/links for the current climb.
 */
export const BetaVideosSection = memo(function BetaVideosSection(_props: BetaVideosSectionProps) {
  const { t } = useTranslation('session');

  return (
    <View style={styles.emptyContainer}>
      <Icon name="video" size={20} color={iosSystemColors.systemGray} />
      <Text variant="subheadline" color={iosSystemColors.systemGray}>
        {t('mobile.betaVideos.empty')}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  emptyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
});
