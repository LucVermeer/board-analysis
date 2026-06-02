import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  VOTE,
  GET_COMMENTS,
  ADD_COMMENT,
  GET_BULK_VOTE_SUMMARIES,
  type VoteMutationResponse,
  type VoteMutationVariables,
  type GetCommentsQueryResponse,
  type AddCommentMutationResponse,
  type AddCommentMutationVariables,
  type GetBulkVoteSummariesQueryResponse,
} from '@boardsesh/graphql/operations';
import type { SocialEntityType } from '@boardsesh/shared-schema';
import { getHttpClient } from '../client';

/**
 * Cast a vote on a social entity (e.g. a session). Returns the updated
 * VoteSummary so the caller can reflect the new count/`userVote` locally, and
 * patches any cached bulk-vote-summary lists so recycled / re-scrolled rows
 * (which reset their optimistic state on remount) stay in sync — no feed-wide
 * refetch needed.
 */
export function useVote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: VoteMutationVariables['input']) => {
      const response = await getHttpClient().request<VoteMutationResponse>(VOTE, { input });
      return response.vote;
    },
    onSuccess: (summary) => {
      queryClient.setQueriesData<GetBulkVoteSummariesQueryResponse['bulkVoteSummaries']>(
        { queryKey: ['bulkVoteSummaries'] },
        (old) => old?.map((entry) => (entry.entityId === summary.entityId ? summary : entry)),
      );
    },
  });
}

/** Accurate vote state (count + `userVote`) for a batch of entities. */
export function useBulkVoteSummaries(entityType: SocialEntityType, entityIds: string[], enabled = true) {
  return useQuery({
    queryKey: ['bulkVoteSummaries', entityType, entityIds],
    queryFn: async () => {
      const response = await getHttpClient().request<GetBulkVoteSummariesQueryResponse>(GET_BULK_VOTE_SUMMARIES, {
        input: { entityType, entityIds },
      });
      return response.bulkVoteSummaries;
    },
    enabled: enabled && entityIds.length > 0,
  });
}

/** Comment thread for a social entity. */
export function useComments(entityType: SocialEntityType, entityId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['comments', entityType, entityId],
    queryFn: async () => {
      const response = await getHttpClient().request<GetCommentsQueryResponse>(GET_COMMENTS, {
        input: { entityType, entityId },
      });
      return response.comments;
    },
    enabled: enabled && !!entityId,
  });
}

/** Add a comment, refreshing the thread + the session feed's comment counts. */
export function useAddComment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: AddCommentMutationVariables['input']) => {
      const response = await getHttpClient().request<AddCommentMutationResponse>(ADD_COMMENT, { input });
      return response.addComment;
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['comments', variables.entityType, variables.entityId] });
      void queryClient.invalidateQueries({ queryKey: ['sessionGroupedFeed'] });
    },
  });
}
