import { type ReactNode } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { SectionHeader } from '../SectionHeader';
import { ActivityIndicator } from '../ActivityIndicator';
import { spacing } from '../../theme/tokens';

export type PlaylistScrollSectionProps = {
  title: string;
  /** PlaylistCard (variant="scroll") children, laid out horizontally. */
  children: ReactNode;
  /** Fires when the user scrolls near the right edge — drives pagination. */
  onEndReached?: () => void;
  /** True while the first page is loading (renders a centered spinner). */
  loading?: boolean;
  /** True while a subsequent page is loading (renders a trailing spinner). */
  isLoadingMore?: boolean;
  /** Trailing header affordance (e.g. "See all") — expands the shelf to a full list. */
  actionLabel?: string;
  onActionPress?: () => void;
};

// Right-edge slop (px) at which onEndReached fires, so the next page starts
// loading before the user hits the very end of the scroller.
const END_REACHED_THRESHOLD = 200;

/**
 * Horizontal playlist scroller with a section title. Uses a ScrollView (the
 * card count per section is small and bounded) and fires `onEndReached` as the
 * content scrolls within `END_REACHED_THRESHOLD` of the right edge.
 */
export function PlaylistScrollSection({
  title,
  children,
  onEndReached,
  loading,
  isLoadingMore,
  actionLabel,
  onActionPress,
}: PlaylistScrollSectionProps) {
  return (
    <View style={styles.section}>
      <SectionHeader title={title} actionLabel={actionLabel} onActionPress={onActionPress} />
      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" />
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          scrollEventThrottle={16}
          onScroll={
            onEndReached
              ? ({ nativeEvent }) => {
                  const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
                  const distanceFromEnd = contentSize.width - (contentOffset.x + layoutMeasurement.width);
                  if (distanceFromEnd < END_REACHED_THRESHOLD) onEndReached();
                }
              : undefined
          }
        >
          {children}
          {isLoadingMore ? (
            <View style={styles.footerLoading}>
              <ActivityIndicator size="small" />
            </View>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: spacing[2],
  },
  scrollContent: {
    paddingHorizontal: spacing[4],
    gap: spacing[4],
    alignItems: 'flex-start',
  },
  loadingRow: {
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerLoading: {
    width: 48,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
