import { useCallback, useEffect, useState } from 'react';
import { useVote } from '../../lib/graphql/hooks';

export type OptimisticVote = {
  /** Whether the viewer has upvoted (optimistic while a tap is in flight). */
  voted: boolean;
  /** Upvote count (optimistic while a tap is in flight). */
  count: number;
  /** Toggle the viewer's vote. No-ops while a previous tap is still in flight. */
  toggle: () => void;
  /** True while the vote mutation is in flight. */
  isPending: boolean;
};

/**
 * Optimistic upvote state for a feed entity (currently sessions). Layers a local
 * override over the server count / `userVote` so the UI flips instantly,
 * reconciles to the server summary on success, rolls back on error, and resets
 * when the row is recycled onto a different entity — FlashList reuses component
 * instances, so without the reset one card's vote would bleed onto another.
 */
export function useOptimisticVote(
  sessionId: string,
  serverUpvotes: number,
  serverUserVote: number | null,
): OptimisticVote {
  // Destructure the stable `mutate` + the `isPending` flag rather than depend on
  // the whole useMutation result — that object is a fresh reference every render,
  // so depending on it would needlessly recreate `toggle` (defeating any memo on
  // consumers). `mutate` is reference-stable; only `isPending` legitimately moves.
  const { mutate: voteMutate, isPending: voteIsPending } = useVote();
  const [optimistic, setOptimistic] = useState<{ count: number; voted: boolean } | null>(null);

  // Recycled onto a different session → drop the previous card's optimistic state.
  useEffect(() => setOptimistic(null), [sessionId]);

  const voted = optimistic ? optimistic.voted : serverUserVote === 1;
  const count = optimistic ? optimistic.count : serverUpvotes;

  const toggle = useCallback(() => {
    if (voteIsPending) return; // guard double-tap
    const nextVoted = !voted;
    setOptimistic({ count: count + (nextVoted ? 1 : -1), voted: nextVoted });
    voteMutate(
      { entityType: 'session', entityId: sessionId, value: nextVoted ? 1 : 0 },
      {
        onSuccess: (summary) => setOptimistic({ count: summary.upvotes, voted: summary.userVote === 1 }),
        onError: () => setOptimistic(null),
      },
    );
  }, [voteMutate, voteIsPending, voted, count, sessionId]);

  return { voted, count, toggle, isPending: voteIsPending };
}
