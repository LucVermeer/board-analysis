import { memo, useCallback } from 'react';
import { View, FlatList, Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Climb } from '@boardsesh/shared-schema';
import { getGradeColor, DEFAULT_GRADE_COLOR } from '@boardsesh/board-constants/grade-colors';
import { Text } from '../Text';
import { Icon } from '../Icon';
import { formatQuality } from '../../lib/format-climb-stats';
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

// ----- Supporting types and components for when the query is wired -----

type SimilarClimbCardProps = {
  climb: Climb;
  onPress: (climb: Climb) => void;
};

/**
 * Compact card for a single similar climb shown in a horizontal list.
 * Exported so tests can reach it once data fetching is integrated.
 */
export const SimilarClimbCard = memo(function SimilarClimbCard({ climb, onPress }: SimilarClimbCardProps) {
  const gradeColor = getGradeColor(climb.difficulty) ?? DEFAULT_GRADE_COLOR;
  const qualityNum = parseFloat(climb.quality_average);
  const qualityDisplay = qualityNum > 0 ? formatQuality(climb.quality_average) : null;

  const handlePress = useCallback(() => {
    onPress(climb);
  }, [climb, onPress]);

  return (
    <Pressable onPress={handlePress} style={styles.card} accessibilityRole="button">
      <Text variant="footnote" numberOfLines={1} style={styles.cardName}>
        {climb.name}
      </Text>
      <View style={styles.cardMeta}>
        <View style={[styles.gradePill, { backgroundColor: gradeColor }]}>
          <Text variant="caption2" color={iosSystemColors.white} style={styles.gradeText}>
            {climb.difficulty}
          </Text>
        </View>
        {qualityDisplay && (
          <View style={styles.qualityRow}>
            <Icon name="star.fill" size={10} color={iosSystemColors.starGold} />
            <Text variant="caption2" color={iosSystemColors.systemGray}>
              {qualityDisplay}
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
});

/**
 * Renders a horizontal FlatList of similar climb cards.
 * Not used yet -- will replace the empty state once data is available.
 */
export function SimilarClimbsList({ climbs, onClimbPress }: { climbs: Climb[]; onClimbPress: (climb: Climb) => void }) {
  const renderItem = useCallback(
    ({ item }: { item: Climb }) => <SimilarClimbCard climb={item} onPress={onClimbPress} />,
    [onClimbPress],
  );

  const keyExtractor = useCallback((item: Climb) => item.uuid, []);

  return (
    <FlatList
      data={climbs}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.listContent}
    />
  );
}

const styles = StyleSheet.create({
  emptyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  listContent: {
    gap: spacing[3],
  },
  card: {
    width: 120,
    padding: spacing[2],
    borderRadius: 8,
    backgroundColor: 'rgba(120, 120, 128, 0.08)',
    gap: spacing[1],
  },
  cardName: {
    fontWeight: '600',
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
  },
  gradePill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  gradeText: {
    fontWeight: '700',
  },
  qualityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
});
