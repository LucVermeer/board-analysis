import { memo, useCallback, useRef } from 'react';
import { ScrollView, View, Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';
import { Text } from '../Text';
import { Icon } from '../Icon';
import { useBetaLinks } from '../../lib/graphql/hooks';
import { useAuth } from '../../providers/auth-provider';
import { iosSystemColors } from '../../theme/ios-colors';
import { brandColors } from '../../theme/colors';
import { spacing, borderRadius } from '../../theme/tokens';
import { BetaVideoCard, BETA_CARD_WIDTH, BETA_CARD_HEIGHT } from './BetaVideoCard';
import { BetaVideoAddSheet, type BetaVideoAddSheetHandle } from './BetaVideoAddSheet';

type BetaVideosSectionProps = {
  climbUuid: string;
  boardName: string;
  angle: number;
};

const SKELETON_COUNT = 3;
const CARD_GAP = spacing[3];

export const BetaVideosSection = memo(function BetaVideosSection({
  climbUuid,
  boardName,
  angle,
}: BetaVideosSectionProps) {
  const { t } = useTranslation('session');
  const { isAuthenticated } = useAuth();
  const addSheetRef = useRef<BetaVideoAddSheetHandle>(null);
  const { data: links, isLoading, isError } = useBetaLinks(boardName, climbUuid);

  const handleOpenAddSheet = useCallback(() => {
    void Haptics.selectionAsync();
    addSheetRef.current?.open();
  }, []);

  const hasContent = links !== undefined && links.length > 0;

  return (
    <View>
      <View style={styles.headerRow}>
        {hasContent && (
          <Text variant="footnote" color={iosSystemColors.systemGray}>
            {t('mobile.betaVideos.videoCount', { count: links.length })}
          </Text>
        )}
        <View style={styles.headerSpacer} />
        {isAuthenticated && (
          <Pressable
            onPress={handleOpenAddSheet}
            accessibilityRole="button"
            accessibilityLabel={t('mobile.betaVideos.addButton')}
            style={({ pressed }) => [styles.addButton, pressed && styles.addButtonPressed]}
            hitSlop={8}
          >
            <Icon name="add" size={22} color={brandColors.primary} />
          </Pressable>
        )}
      </View>

      {isLoading ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          scrollEnabled={false}
        >
          {Array.from({ length: SKELETON_COUNT }).map((_, index) => (
            <View key={`skeleton-${index}`} style={styles.skeletonCard} />
          ))}
        </ScrollView>
      ) : isError || !links || links.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Icon name="video" size={20} color={iosSystemColors.systemGray} />
          <Text variant="subheadline" color={iosSystemColors.systemGray}>
            {t('mobile.betaVideos.empty')}
          </Text>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          snapToInterval={BETA_CARD_WIDTH + CARD_GAP}
          decelerationRate="fast"
          snapToAlignment="start"
        >
          {links.map((link) => (
            <BetaVideoCard key={`${link.link}-${link.created_at}`} link={link} />
          ))}
        </ScrollView>
      )}

      {isAuthenticated && (
        <BetaVideoAddSheet ref={addSheetRef} boardName={boardName} climbUuid={climbUuid} angle={angle} />
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: spacing[2],
    minHeight: 24,
  },
  headerSpacer: {
    flex: 1,
  },
  addButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.full,
  },
  addButtonPressed: {
    backgroundColor: `${brandColors.primary}1A`,
  },
  scrollContent: {
    gap: CARD_GAP,
    paddingVertical: spacing[1],
  },
  skeletonCard: {
    width: BETA_CARD_WIDTH,
    height: BETA_CARD_HEIGHT,
    borderRadius: borderRadius.md,
    backgroundColor: `${iosSystemColors.systemGray}26`,
  },
  emptyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingVertical: spacing[3],
  },
});
