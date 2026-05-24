import { memo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Climb } from '@boardsesh/shared-schema';
import { Text } from '../Text';
import { Icon } from '../Icon';
import { iosSystemColors } from '../../theme/ios-colors';
import { spacing } from '../../theme/tokens';

type SimilarClimbsSectionProps = {
  climbUuid: string;
  boardName: string;
  layoutId: number;
  sizeId: number;
  setIds: string;
  angle: number;
  onClimbPress: (climb: Climb) => void;
};

/**
 * Stub implementation -- renders a placeholder until the GraphQL
 * similarClimbs query is wired on mobile. Once available, this will
 * fetch and display a horizontal list of similar climbs.
 */
export const SimilarClimbsSection = memo(function SimilarClimbsSection(_props: SimilarClimbsSectionProps) {
  const { t } = useTranslation('session');

  // TODO: Wire up useQuery with similarClimbs GraphQL operation
  // For now, show an empty state placeholder.
  return (
    <View style={styles.emptyContainer}>
      <Icon name="search" size={20} color={iosSystemColors.systemGray} />
      <Text variant="subheadline" color={iosSystemColors.systemGray}>
        {t('mobile.similarClimbs.empty')}
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
