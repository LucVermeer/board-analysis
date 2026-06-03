import { useEffect, useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Text } from '../Text';
import { Icon } from '../Icon';
import { useVote } from '../../lib/graphql/hooks';
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
  const vote = useVote();

  // Optimistic override layered over the server values. Null = show server
  // state. Reset whenever the row is recycled onto a different session
  // (FlashList reuses component instances), so one card's vote can't bleed
  // onto another.
  const [optimistic, setOptimistic] = useState<{ count: number; voted: boolean } | null>(null);
  useEffect(() => setOptimistic(null), [sessionId]);

  const voted = optimistic ? optimistic.voted : userVote === 1;
  const count = optimistic ? optimistic.count : upvotes;

  const handleVote = () => {
    if (vote.isPending) return; // guard double-tap
    hapticLight();
    const nextVoted = !voted;
    setOptimistic({ count: count + (nextVoted ? 1 : -1), voted: nextVoted });
    vote.mutate(
      { entityType: 'session', entityId: sessionId, value: nextVoted ? 1 : 0 },
      {
        onSuccess: (summary) => setOptimistic({ count: summary.upvotes, voted: summary.userVote === 1 }),
        onError: () => setOptimistic(null),
      },
    );
  };

  return (
    <View style={styles.row}>
      <Pressable
        style={styles.button}
        onPress={handleVote}
        disabled={vote.isPending}
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
