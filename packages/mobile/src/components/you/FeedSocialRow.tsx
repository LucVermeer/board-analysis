import { View, Pressable, StyleSheet } from 'react-native';
import { Text } from '../Text';
import { Icon } from '../Icon';
import { useOptimisticVote } from './use-optimistic-vote';
import { hapticLight } from '../../lib/haptics';
import { brandColors } from '../../theme/colors';
import { spacing } from '../../theme/tokens';
import { useTheme } from '../../providers/theme-provider';

type FeedSocialRowProps = {
  sessionId: string;
  /** Server upvote count (from the bulk vote summary, else the feed item). */
  upvotes: number;
  /** Server vote for the viewer: 1 = upvoted, else not. */
  userVote: number | null;
  commentCount: number;
  onOpenComments: (sessionId: string) => void;
};

/** Vote + comment row for a session feed card. */
export function FeedSocialRow({ sessionId, upvotes, userVote, commentCount, onOpenComments }: FeedSocialRowProps) {
  const { systemColors } = useTheme();
  const { voted, count, toggle, isPending } = useOptimisticVote(sessionId, upvotes, userVote);

  const handleVote = () => {
    if (isPending) return; // guard double-tap (toggle no-ops too)
    hapticLight();
    toggle();
  };

  return (
    <View style={styles.row}>
      <Pressable
        style={styles.button}
        onPress={handleVote}
        disabled={isPending}
        accessibilityRole="button"
        accessibilityState={{ selected: voted }}
        hitSlop={6}
      >
        <Icon
          name={voted ? 'favorite.fill' : 'favorite'}
          size={18}
          color={voted ? brandColors.error : systemColors.secondaryLabel}
        />
        {count > 0 && (
          <Text variant="footnote" color={systemColors.secondaryLabel}>
            {count}
          </Text>
        )}
      </Pressable>
      <Pressable style={styles.button} onPress={() => onOpenComments(sessionId)} accessibilityRole="button" hitSlop={6}>
        <Icon name="comment" size={18} color={systemColors.secondaryLabel} />
        {commentCount > 0 && (
          <Text variant="footnote" color={systemColors.secondaryLabel}>
            {commentCount}
          </Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing[6],
    marginTop: spacing[3],
    paddingTop: spacing[3],
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
  },
});
