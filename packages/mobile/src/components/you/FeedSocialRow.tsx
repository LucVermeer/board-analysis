import { useState } from 'react';
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
  upvotes: number;
  commentCount: number;
  onOpenComments: (sessionId: string) => void;
};

/** Vote + comment row for a session feed card. */
export function FeedSocialRow({ sessionId, upvotes, commentCount, onOpenComments }: FeedSocialRowProps) {
  const { systemColors } = useTheme();
  const vote = useVote();
  const [voted, setVoted] = useState(false);
  const [count, setCount] = useState(upvotes);

  const handleVote = () => {
    hapticLight();
    const nextVoted = !voted;
    // Optimistic; reconcile from the returned summary.
    setVoted(nextVoted);
    setCount((current) => current + (nextVoted ? 1 : -1));
    vote.mutate(
      { entityType: 'session', entityId: sessionId, value: nextVoted ? 1 : 0 },
      {
        onSuccess: (summary) => {
          setCount(summary.upvotes);
          setVoted(summary.userVote === 1);
        },
        onError: () => {
          setVoted(!nextVoted);
          setCount((current) => current + (nextVoted ? -1 : 1));
        },
      },
    );
  };

  return (
    <View style={styles.row}>
      <Pressable style={styles.button} onPress={handleVote} accessibilityRole="button" hitSlop={6}>
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
